import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("fetch_transform", ROOT / "scripts/fetch-pdf-transform-evidence.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class EvidencePrefilterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive = Path(self.temp.name) / "evidence.zip"
        self.origin = {"run_id": 123, "source_commit": "a" * 40}
        self.engine = "b" * 64
        self.snapshot = dict(schema=1, scope="shadow-transform-inputs", origin=self.origin,
                             engine_sha256=self.engine)
        self.plan = dict(schema=1, scope="advisory-transform-reuse-plan", origin=self.origin,
                         engine_sha256=self.engine, authorization_granted=False,
                         skip_scan_granted=False)
    def write(self, extra=False):
        with zipfile.ZipFile(self.archive, "w") as z:
            z.writestr("snapshot.json", json.dumps(self.snapshot))
            z.writestr("plan.json", json.dumps(self.plan))
            if extra:
                z.writestr("extra", "unexpected")
    def test_exact_engine(self):
        self.write()
        self.assertTrue(module.inspect_evidence(self.archive, self.origin, self.engine))
    def test_incompatible_engine(self):
        self.write()
        self.assertFalse(module.inspect_evidence(self.archive, self.origin, "c" * 64))
    def test_mismatched_plan(self):
        self.plan["engine_sha256"] = "c" * 64
        self.write()
        with self.assertRaises(ValueError):
            module.inspect_evidence(self.archive, self.origin, self.engine)
    def test_wrong_origin(self):
        self.write()
        with self.assertRaises(ValueError):
            module.inspect_evidence(self.archive, {}, self.engine)
    def test_authorization_rejected(self):
        self.plan["authorization_granted"] = True
        self.write()
        with self.assertRaises(ValueError):
            module.inspect_evidence(self.archive, self.origin, self.engine)
    def test_extra_member_rejected(self):
        self.write(extra=True)
        with self.assertRaises(ValueError):
            module.inspect_evidence(self.archive, self.origin, self.engine)

if __name__ == "__main__":
    unittest.main()
