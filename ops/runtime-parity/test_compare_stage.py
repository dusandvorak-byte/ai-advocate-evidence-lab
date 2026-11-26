import copy
import unittest
from compare_stage import compare, SECTIONS


class ParityTests(unittest.TestCase):
    def setUp(self):
        self.sha = "a" * 40
        self.baseline = {
            "schema_version": "1.1-sliced", "checkout_commit": self.sha,
            "summary": {"hard_failure_count": 0, "hard_failures": [],
                        "staged_set_exact_match": True,
                        "id69_absent_from_final_release_state": True,
                        "human_content_privacy_review_still_required": True,
                        "all_final_staged_pdf_count": 1,
                        "generated_derivative_count": 1,
                        "registry_public_derivative_count": 1},
            "generated_public_derivatives": [{"output": "a.pdf", "output_sha256": "b"*64}],
            "registry_public_derivatives": [{"public_path": "a.pdf", "sha256": "b"*64}],
            "all_final_web_pdfs": [{"published_path": "a.pdf", "sha256": "b"*64}],
        }
        self.fragments = {k: {"checkout_commit": self.sha, "failures": [],
                              "data": copy.deepcopy(self.baseline[v])} for k,v in SECTIONS.items()}

    def test_exact(self):
        self.assertTrue(compare(self.baseline, self.fragments, self.sha)["exact_semantic_match"])
        self.assertFalse(compare(self.baseline, self.fragments, self.sha)["production_authorization"])

    def test_changed_bytes(self):
        self.fragments["pdf-shard"]["data"][0]["sha256"] = "c"*64
        with self.assertRaises(ValueError):
            compare(self.baseline, self.fragments, self.sha)

    def test_duplicate_path(self):
        self.fragments["pdf-shard"]["data"] *= 2
        with self.assertRaises(ValueError):
            compare(self.baseline, self.fragments, self.sha)

    def test_missing_section(self):
        del self.fragments["generated"]
        with self.assertRaises(ValueError):
            compare(self.baseline, self.fragments, self.sha)

    def test_failure(self):
        self.fragments["registry-derivatives"]["failures"] = ["fixture"]
        with self.assertRaises(ValueError):
            compare(self.baseline, self.fragments, self.sha)

    def test_wrong_commit(self):
        with self.assertRaises(ValueError):
            compare(self.baseline, self.fragments, "d"*40)

    def test_human_review_preserved(self):
        self.baseline["summary"]["human_content_privacy_review_still_required"] = False
        with self.assertRaises(ValueError):
            compare(self.baseline, self.fragments, self.sha)

    def test_diagnostic_tail_only(self):
        self.fragments["pdf-shard"]["data"][0]["qpdf_check_tail"] = "fixture"
        self.assertTrue(compare(self.baseline, self.fragments, self.sha)["exact_semantic_match"])
        self.fragments["pdf-shard"]["data"][0]["unexpected"] = True
        with self.assertRaises(ValueError):
            compare(self.baseline, self.fragments, self.sha)


if __name__ == "__main__":
    unittest.main()
