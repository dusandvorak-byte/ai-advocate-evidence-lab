import hashlib
from pathlib import Path
import tempfile
import unittest
import zipfile
from extract_pinned_baseline import extract


class ExtractionTests(unittest.TestCase):
    def run_archive(self, names, report=False, wrong_hash=False):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            archive = root / "input.zip"
            out = root / "out"
            out.mkdir()
            with zipfile.ZipFile(archive, "w") as z:
                for name in names:
                    z.writestr(name, "synthetic")
            sha = hashlib.sha256(archive.read_bytes()).hexdigest()
            extract(archive, out, "0"*64 if wrong_hash else sha, report=report)
            return sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file())

    def test_allowed_tree(self):
        names = ["web/example.pdf", "release-site/example.pdf",
                 "project-memory/documents-2026.json"]
        self.assertEqual(self.run_archive(names), sorted(names))

    def test_wrong_hash(self):
        with self.assertRaises(ValueError):
            self.run_archive(["web/example.pdf"], wrong_hash=True)

    def test_wrong_scope_and_traversal(self):
        for name in ("scripts/unexpected.py", "web/../../escape", "/absolute", "web\\bad"):
            with self.assertRaises(ValueError):
                self.run_archive([name])

    def test_report_exact_member(self):
        self.assertEqual(self.run_archive(["release-evidence-audit.json"], report=True),
                         ["release-evidence-audit.json"])
        with self.assertRaises(ValueError):
            self.run_archive(["release-evidence-audit.json", "other.json"], report=True)


if __name__ == "__main__":
    unittest.main()
