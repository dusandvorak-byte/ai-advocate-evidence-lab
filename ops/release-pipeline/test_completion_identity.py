import copy
import unittest
from completion_identity import select_completed_run, REPO, WORKFLOW

SHA = "a"*40

def run():
    return {"id": 123, "run_attempt": 1, "head_sha": SHA, "head_branch": "main",
            "event": "push", "path": WORKFLOW, "status": "completed", "conclusion": "success",
            "repository": {"full_name": REPO}, "head_repository": {"full_name": REPO}}

class IdentityTests(unittest.TestCase):
    def test_exact(self):
        self.assertEqual(select_completed_run(run(), run(), run(), SHA), 123)

    def test_retry_exact_attempt(self):
        a = run()
        a["run_attempt"] = 2
        self.assertEqual(select_completed_run(a, a, a, SHA), 123)
        with self.assertRaises(ValueError):
            select_completed_run(run(), a, a, SHA)

    def test_invalid_identity_fields(self):
        for key, value in {"head_sha": "b"*40, "head_branch": "feature", "event": "pull_request",
                           "path": ".github/workflows/other.yml", "status": "in_progress",
                           "conclusion": "failure", "repository": {"full_name":"fork/repo"},
                           "head_repository": {"full_name":"fork/repo"}, "id": True,
                           "run_attempt": 0}.items():
            for index in range(3):
                candidates = [run(), run(), run()]
                candidates[index][key] = value
                with self.subTest(key=key,index=index), self.assertRaises(ValueError):
                    select_completed_run(*candidates, SHA)

    def test_superseded(self):
        a = run()
        a["id"] = 124
        with self.assertRaises(ValueError):
            select_completed_run(run(), run(), a, SHA)

    def test_main_moved(self):
        with self.assertRaises(ValueError):
            select_completed_run(run(), run(), run(), "b"*40)

    def test_missing_fields(self):
        for key in run():
            a = run()
            del a[key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                select_completed_run(a, run(), run(), SHA)

if __name__ == "__main__":
    unittest.main(verbosity=2)
