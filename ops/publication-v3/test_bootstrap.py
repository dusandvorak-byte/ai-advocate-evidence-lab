import tempfile
from pathlib import Path
import unittest
from bootstrap import inventory, compare_pdf_inventory, plan_delta

class BootstrapTests(unittest.TestCase):
    def test_pdf_exact_set_and_bytes(self):
        rows = {"a.pdf": {"sha256": "a"*64, "size": 1}, "index.html": {"sha256": "b"*64, "size": 1}}
        final = {"a.pdf": {"sha256": "a"*64, "page_count": 1}}
        self.assertEqual(compare_pdf_inventory(rows, final)["a.pdf"]["page_count"], 1)
        with self.assertRaises(ValueError):
            compare_pdf_inventory(rows, {})
        with self.assertRaises(ValueError):
            compare_pdf_inventory(rows, {"a.pdf": {"sha256": "c"*64, "page_count": 1}})
    def test_delta_is_not_approval(self):
        old = {"a.pdf": 1, "b.pdf": 2, "c.pdf": 3, "index.html": 4}
        new = {"a.pdf": 1, "b.pdf": 3, "d.pdf": 4, "index.html": 5}
        d = plan_delta(old, new)
        self.assertEqual(d["unchanged"], ["a.pdf"])
        self.assertEqual(d["pdf_requiring_new_review"], ["b.pdf", "d.pdf"])
        self.assertEqual(d["removed"], ["c.pdf"])
        self.assertFalse(d["publication_authorized"])
    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a").write_text("x")
            (root / "b").symlink_to(root / "a")
            with self.assertRaises(ValueError):
                inventory(root)

if __name__ == "__main__":
    unittest.main()
