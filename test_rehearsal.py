from pathlib import Path
import tempfile
import unittest
from rehearsal import build_preview, fixture_pdf, inventory, FIXTURE, INDEX, METADATA

class RehearsalTests(unittest.TestCase):
    def test_only_three_delta_files(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            base = root / "base"
            base.mkdir()
            (base / "existing.pdf").write_bytes(fixture_pdf())
            rows = inventory(base)
            seed = {"files": rows, "pdfs": rows}
            result = build_preview(base, root / "delta", seed)
            self.assertEqual(set(inventory(root / "delta")), {FIXTURE, INDEX, METADATA})
            self.assertEqual(inventory(base), rows)
            self.assertEqual(result["new_pdf_paths"], 1)
            self.assertFalse(result["publication_authorized"])
            (base / "existing.pdf").write_bytes(b"changed")
            with self.assertRaises(ValueError):
                build_preview(base, root / "bad", seed)
    def test_fixture_deterministic(self):
        self.assertEqual(fixture_pdf(), fixture_pdf())
        self.assertTrue(fixture_pdf().endswith(b"%%EOF\n"))
    def test_no_symlinks(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            (root / "link").symlink_to("/etc/passwd")
            with self.assertRaises(ValueError):
                inventory(root)

if __name__ == "__main__":
    unittest.main()
