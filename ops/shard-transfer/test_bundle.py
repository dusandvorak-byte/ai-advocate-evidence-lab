import hashlib
from pathlib import Path
import tempfile
import unittest
import zipfile
from bundle import build_bundle, read_bundle
from transfer_plan import plan


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.rows = []
        for name, raw in [("a.pdf", b"%PDF-1.4 fixture A"),
                          ("web/a.pdf", b"%PDF-1.4 fixture A"),
                          ("b.pdf", b"%PDF-1.4 fixture B")]:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(raw)
            self.rows.append({"path":name,"sha256":hashlib.sha256(raw).hexdigest(),"size":len(raw)})

    def test_roundtrip_all_shards(self):
        results = []
        for i in range(4):
            path = self.root / f"{i}.zip"
            build_bundle(self.root, self.rows, 4, i, path)
            results.append(read_bundle(path, self.rows, 4, i))
        self.assertEqual(sum(r["verified_representatives"] for r in results), 2)
        self.assertEqual(sum(r["verified_bytes"] for r in results), 36)
        self.assertTrue(all(not r["production_authoritative"] for r in results))

    def test_corrupt_extra_missing_and_duplicate(self):
        digest = self.rows[0]["sha256"]
        raw = (self.root / "a.pdf").read_bytes()
        rows = [self.rows[0]]
        for i, entries in enumerate([[], [(digest+".pdf", b"x"*len(raw))],
            [(digest+".pdf", raw), ("extra.pdf", raw)],
            [(digest+".pdf",raw),(digest+".pdf",raw)],
            [("../"+digest+".pdf",raw)]]):
            archive = self.root / f"bad{i}.zip"
            with zipfile.ZipFile(archive, "w") as z:
                for name, data in entries:
                    z.writestr(name, data)
            with self.assertRaises(ValueError):
                read_bundle(archive, rows, 1, 0)

    def test_changed_source_rejected(self):
        (self.root / "a.pdf").write_bytes(b"x"*self.rows[0]["size"])
        with self.assertRaises(ValueError):
            build_bundle(self.root, self.rows, 1, 0, self.root / "bad.zip")


if __name__ == "__main__":
    unittest.main(verbosity=2)
