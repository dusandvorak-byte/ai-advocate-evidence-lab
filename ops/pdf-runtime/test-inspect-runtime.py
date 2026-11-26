"""Synthetic tests for the isolated runtime inventory; no secrets or real PDFs."""
import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("inspect_runtime", pathlib.Path(__file__).with_name("inspect-runtime.py"))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

class LockTests(unittest.TestCase):
    def setUp(self):
        self.actual = {"schema": 1, "python": "3.12.16", "python_binary_sha256": "a"*64,
                       "os_packages": {"qpdf": "1", "libqpdf": "2"},
                       "python_distributions": {"pymupdf": {"version": "2.1", "record_sha256": "b"*64}},
                       "tools": {name: "c"*64 for name in runtime.TOOLS}}
        self.expected = {"python":"3.12.16", "apt":{"qpdf":"1"}, "python_distributions":{"PyMuPDF":"2.1"}}
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
