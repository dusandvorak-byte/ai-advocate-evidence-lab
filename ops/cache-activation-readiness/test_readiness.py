import json
import unittest
from activation_readiness import evaluate, shadow_event, verify_run, REPO, WORKFLOW

class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.row = dict(event="pdf-transform-shadow", captured=309,
                        potential_hits=215, exact_matches=215, mismatches=0,
                        prior_entry_count=216, path_identity_matches=215,
                        skipped=0, fresh_scan_authoritative=True, identity_mismatches=[])
    def test_exact_shadow(self):
        self.assertTrue(evaluate(self.row)["eligible"])
    def test_incompatible_engine(self):
        self.row.update(potential_hits=0, exact_matches=0,
                        identity_mismatches=["engine_sha256"])
        self.assertFalse(evaluate(self.row)["eligible"])
    def test_mismatch(self):
        self.row.update(exact_matches=214, mismatches=1)
        self.assertFalse(evaluate(self.row)["eligible"])
    def test_skipped(self):
        self.row["skipped"] = 1
        with self.assertRaises(ValueError):
            evaluate(self.row)
    def test_inconsistent_counts(self):
        self.row["exact_matches"] = 216
        with self.assertRaises(ValueError):
            evaluate(self.row)
    def test_cold_cache(self):
        self.assertFalse(evaluate({"event":"pdf-transform-shadow","prior_available":False})["eligible"])
    def test_ambiguous_log(self):
        line = "2026-11-26T17:00:00Z " + json.dumps(self.row)
        self.assertEqual(shadow_event(line), self.row)
        with self.assertRaises(ValueError):
            shadow_event(line + "\n" + line)
    def test_exact_run(self):
        run = dict(id=10, head_sha="a"*40, head_branch="main", event="push",
                   path=WORKFLOW, status="completed", conclusion="success",
                   run_attempt=1, repository={"full_name":REPO},
                   head_repository={"full_name":REPO})
        verify_run(run,"a"*40,10)
        run["run_attempt"]=2
        with self.assertRaises(ValueError):
            verify_run(run,"a"*40,10)

if __name__ == "__main__":
    unittest.main()
