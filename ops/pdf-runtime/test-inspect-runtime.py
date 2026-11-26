"""Synthetic tests for the isolated runtime inventory; no secrets or real PDFs."""
import copy
import importlib.util
import pathlib
import unittest
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("inspect_runtime", pathlib.Path(__file__).with_name("inspect-runtime.py"))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class LockTests(unittest.TestCase):
    def setUp(self):
        self.actual = {"schema": 1, "python": "3.12.16", "python_binary_sha256": "a"*64,
                       "os_packages": {"qpdf": "1", "libqpdf": "2"}, "os_payload_sha256": "f"*64,
                       "python_distributions": {"pymupdf": {"version": "2.1", "record_sha256": "b"*64, "payload_sha256": "a"*64}},
                       "tools": {name: "c"*64 for name in runtime.TOOLS}}
        self.expected = {"python":"3.12.16", "apt":{"qpdf":"1"}, "python_distributions":{"PyMuPDF":"2.1"}}
    def test_dpkg_multiple_packages_and_diversions(self):
        with tempfile.TemporaryDirectory() as root:
            a = pathlib.Path(root) / "a"
            b = pathlib.Path(root) / "b"
            a.write_bytes(b"one")
            b.write_bytes(b"two")
            output = f"{a}\n\n{b}\ndiversion of {a} to {b} by fixture\n"
            paths, records = runtime.parse_dpkg_list(output)
            self.assertEqual(set(paths), {str(a), str(b)})
            self.assertEqual(records, [[str(a), str(b), "fixture"]])
            with self.assertRaises(ValueError):
                runtime.parse_dpkg_list("/some/path\nunknown output")
    def test_package_diverts_others_record(self):
        with tempfile.TemporaryDirectory() as root:
            target = pathlib.Path(root) / "diverted"
            target.write_bytes(b"fixture")
            paths, records = runtime.parse_dpkg_list(f"package diverts others to: {target}\n")
            self.assertEqual(paths, [str(target)])
            self.assertEqual(records, [[None, str(target), "package-diverts-others"]])
            target.unlink()
            paths, records = runtime.parse_dpkg_list(f"package diverts others to: {target}\n")
            self.assertEqual(paths, [])
            self.assertEqual(records, [[None, str(target), "package-diverts-others"]])

    def test_base_files_diverted_by_record(self):
        with tempfile.TemporaryDirectory() as root:
            target = pathlib.Path(root) / "lib.usr-is-merged"
            target.mkdir()
            paths, records = runtime.parse_dpkg_list(f"diverted by base-files to: {target}\n")
            self.assertEqual(paths, [str(target)])
            self.assertEqual(records, [[None, str(target), "base-files"]])
        paths, records = runtime.parse_dpkg_list("diverted by base-files to: /nonexistent-fixture-path\n")
        self.assertEqual(paths, [])
        self.assertEqual(records, [[None, "/nonexistent-fixture-path", "base-files"]])

    def test_inventory_accepts_realistic_multi_package_output(self):
        with tempfile.TemporaryDirectory() as root:
            a = pathlib.Path(root) / "a"
            b = pathlib.Path(root) / "b"
            a.write_bytes(b"one")
            b.write_bytes(b"two")
            class Dist:
                metadata = {"Name":"fixture"}
                version = "1"
                files = [a]
                def read_text(self, name):
                    return "fixture RECORD"
                def locate_file(self, path):
                    return path
            def command(argv):
                return "pkg-a\t1\npkg-b\t2" if argv[1] == "-W" else f"{a}\n\n{b}\n"
            with patch.object(runtime, "command", side_effect=command), patch.object(runtime.importlib.metadata, "distributions", return_value=[Dist()]), patch.object(runtime.shutil, "which", return_value=str(a)):
                before = runtime.inventory()
                b.write_bytes(b"changed")
                after = runtime.inventory()
                self.assertNotEqual(before["os_payload_sha256"], after["os_payload_sha256"])
                b.unlink()
                with self.assertRaises(FileNotFoundError):
                    runtime.inventory()
    def test_exact_match(self):
        self.assertTrue(runtime.validate_exact(self.actual, copy.deepcopy(self.actual)))
        self.assertEqual(runtime.validate_observed(self.actual, self.expected), [])
    def test_transitive_drift(self):
        other = copy.deepcopy(self.actual)
        other["os_packages"]["libqpdf"] = "3"
        self.assertFalse(runtime.validate_exact(other, self.actual))
    def test_wheel_record_drift(self):
        other = copy.deepcopy(self.actual)
        other["python_distributions"]["pymupdf"]["record_sha256"] = "d"*64
        self.assertFalse(runtime.validate_exact(other, self.actual))
    def test_python_payload_drift_without_record_change(self):
        other = copy.deepcopy(self.actual)
        other["python_distributions"]["pymupdf"]["payload_sha256"] = "d"*64
        self.assertFalse(runtime.validate_exact(other, self.actual))
    def test_os_payload_drift_without_version_change(self):
        other = copy.deepcopy(self.actual)
        other["os_payload_sha256"] = "d"*64
        self.assertFalse(runtime.validate_exact(other, self.actual))
    def test_actual_file_drift_and_deletion(self):
        with tempfile.TemporaryDirectory() as root:
            path = pathlib.Path(root) / "library.so"
            path.write_bytes(b"first")
            before = runtime.payload_digest([path])
            path.write_bytes(b"other")
            self.assertNotEqual(before, runtime.payload_digest([path]))
            path.unlink()
            with self.assertRaises(FileNotFoundError):
                runtime.payload_digest([path])
    def test_symlink_target_drift(self):
        with tempfile.TemporaryDirectory() as root:
            target = pathlib.Path(root) / "library.so.1"
            target.write_bytes(b"first")
            link = pathlib.Path(root) / "library.so"
            link.symlink_to(target.name)
            before = runtime.payload_digest([link])
            target.write_bytes(b"other")
            self.assertNotEqual(before, runtime.payload_digest([link]))
            target.unlink()
            with self.assertRaises(FileNotFoundError):
                runtime.payload_digest([link])
    def test_binary_drift(self):
        other = copy.deepcopy(self.actual)
        other["tools"]["qpdf"] = "e"*64
        self.assertFalse(runtime.validate_exact(other, self.actual))
    def test_missing_tool(self):
        other = copy.deepcopy(self.actual)
        del other["tools"]["mutool"]
        self.assertFalse(runtime.validate_exact(other, other))
    def test_version_drift(self):
        other = copy.deepcopy(self.actual)
        other["python"] = "3.12.17"
        other["python_distributions"]["pymupdf"]["version"] = "3"
        self.assertEqual(runtime.validate_observed(other, self.expected), ["python", "python:PyMuPDF"])

if __name__ == "__main__":
    unittest.main()
