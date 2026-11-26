import copy
import unittest
from completion_artifacts import select_artifacts, validate_report

SHA = "a"*40

def artifacts():
    return [{"id": i, "name": name + SHA, "expired": False,
             "workflow_run":{"id":123,"head_sha":SHA},
             "digest":"sha256:"+"b"*64,"size_in_bytes":100}
            for i,name in enumerate(("trusted-public-tree-","evidence-lab-pdf-shard-diagnostic-"),1)]

class ArtifactTests(unittest.TestCase):
    def test_exact(self):
        self.assertEqual(select_artifacts(artifacts(),123,SHA)["tree"]["id"],1)
    def test_missing_duplicate(self):
        a = artifacts()
        for rows in (a[:1], a+[copy.deepcopy(a[0])]):
            with self.assertRaises(ValueError):
                select_artifacts(rows,123,SHA)
    def test_stale_or_invalid(self):
        for key,value in {"expired":True,"workflow_run":{"id":124,"head_sha":SHA},
                          "digest":"bad","size_in_bytes":0,"id":True}.items():
            a = artifacts()
            a[0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                select_artifacts(a,123,SHA)
    def test_report_gates(self):
        report = {"checkout_commit":SHA,"schema_version":"1.1-sliced",
                  "summary":{"hard_failure_count":0,"hard_failures":[],
                             "human_content_privacy_review_still_required":True},
                  "registry_web_stage_reconciliation":{"staged_set_exact_match":True,
                                                       "id69_absent_from_final_release_state":True}}
        validate_report(report,SHA)
        for section,key,value in [("summary","hard_failure_count",1),
            ("summary","human_content_privacy_review_still_required",False),
            ("registry_web_stage_reconciliation","id69_absent_from_final_release_state",False),
            ("registry_web_stage_reconciliation","staged_set_exact_match",False)]:
            bad = copy.deepcopy(report)
            bad[section][key] = value
            with self.assertRaises(ValueError):
                validate_report(bad,SHA)

if __name__ == "__main__":
    unittest.main(verbosity=2)
