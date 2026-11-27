import unittest
from privacy_gate import decision, digest, POLICY_PATH, REVIEW_COVERAGE
PDF = b"%PDF-1.4\nsynthetic-only"
def review(*findings):
    return {"pdf_sha256": digest(PDF), "policy_sha256": digest(POLICY_PATH.read_bytes()),
            "explicit_hold": False, "review_complete": True,
            "coverage": dict.fromkeys(REVIEW_COVERAGE, True), "findings": list(findings)}
class PrivacyTests(unittest.TestCase):
    def test_owner_name_never_forces_rewrite(self):
        self.assertEqual(decision(PDF, review({"role":"author","field":"name","verified_role":True}))["action"], "preserve_exact_bytes")
    def test_third_person_even_in_owner_document(self):
        self.assertEqual(decision(PDF, review({"role":"author","field":"name","verified_role":True},{"role":"private_third_person","field":"name"}))["action"], "redact")
    def test_initials_only_if_nonidentifying(self):
        for safe, expected in [(True,"preserve_exact_bytes"),(False,"redact")]:
            self.assertEqual(decision(PDF, review({"role":"private_third_person","field":"initials","nonidentifying_in_context":safe}))["action"],expected)
    def test_private_details_and_uncertain_role(self):
        self.assertEqual(decision(PDF, review({"role":"author","field":"private_identifier"}))["action"],"redact")
        self.assertEqual(decision(PDF, review({"role":"uncertain_role","field":"name"}))["action"],"hold")
    def test_hold_and_exact_bytes_and_coverage(self):
        for changes in [{"explicit_hold":True},{"pdf_sha256":"0"*64},{"policy_sha256":"0"*64},{"coverage":{}},{"review_complete":False}]:
            self.assertEqual(decision(PDF, review()|changes)["action"],"hold")
        self.assertFalse(decision(PDF,review())["publication_authorized"])
if __name__ == "__main__":
    unittest.main()
