import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from publication_redaction import (
    RedactionPolicyError,
    forbidden_public_identifiers,
    redact_public_text,
)

CONTRACT = json.loads((ROOT / "project-memory/private-redaction-policy-contract.json").read_text("utf-8"))


class PublicationRedactionTests(unittest.TestCase):
    def setUp(self):
        self.original = os.environ.get("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY")
        self.tmp = tempfile.TemporaryDirectory()
        self.policy_path = Path(self.tmp.name) / "private-policy.json"

    def tearDown(self):
        if self.original is None:
            os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY", None)
        else:
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = self.original
        self.tmp.cleanup()

    def write_policy(self, *, revision=None, token=None):
        payload = {
            "policy_id": CONTRACT["policy_id"],
            "revision": CONTRACT["revision"] if revision is None else revision,
            "revision_token": CONTRACT["revision_token"] if token is None else token,
            "rules": [
                {"id": "private_email", "mode": "literal", "value": "private.person@example.invalid", "replacement": "[private email redacted]"},
                {"id": "private_data_box", "mode": "literal", "value": "ab12cd3", "replacement": "[private data-box redacted]"},
                {"id": "private_birth_date", "mode": "literal", "value": "3. 2. 1974", "replacement": "1974"},
                {"id": "private_address_wrapped", "mode": "regex", "value": r"SecretTown\s+42\s*,?\s*123\s*45\s*\n?\s*Exampleville", "replacement": "Exampleville"},
            ],
            "forbidden": [
                {"mode": "literal", "value": "private.person@example.invalid"},
                {"mode": "literal", "value": "ab12cd3"},
                {"mode": "literal", "value": "3. 2. 1974"},
                {"mode": "regex", "value": r"SecretTown\s+42"},
            ],
        }
        self.policy_path.write_text(json.dumps(payload), "utf-8")
        os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = str(self.policy_path)

    def test_requires_private_policy(self):
        os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY", None)
        with self.assertRaises(RedactionPolicyError):
            redact_public_text("synthetic input")

    def test_rejects_private_policy_inside_public_repository(self):
        local = ROOT / ".tmp-public-policy-test.json"
        try:
            local.write_text(json.dumps({
                "policy_id": CONTRACT["policy_id"],
                "revision": CONTRACT["revision"],
                "revision_token": CONTRACT["revision_token"],
                "rules": [{"id": "x", "value": "secret", "replacement": "[redacted]"}],
                "forbidden": [{"value": "secret"}],
            }), "utf-8")
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = str(local)
            with self.assertRaises(RedactionPolicyError):
                redact_public_text("secret")
        finally:
            local.unlink(missing_ok=True)

    def test_rejects_stale_policy_revision(self):
        self.write_policy(revision=CONTRACT["revision"] + 1)
        with self.assertRaises(RedactionPolicyError):
            redact_public_text("private.person@example.invalid")

    def test_synthetic_private_values_are_redacted(self):
        self.write_policy()
        source = """Public Person
born 3. 2. 1974
SecretTown 42, 123 45
Exampleville
ID: ab12cd3
private.person@example.invalid
"""
        public = redact_public_text(source)
        self.assertIn("Public Person", public)
        self.assertIn("1974", public)
        self.assertNotIn("3. 2. 1974", public)
        self.assertNotIn("SecretTown 42", public)
        self.assertNotIn("ab12cd3", public)
        self.assertNotIn("private.person@example.invalid", public)
        self.assertEqual(forbidden_public_identifiers(public), [])

    def test_unlisted_institutional_contact_is_preserved(self):
        self.write_policy()
        source = "Office: public.registry@example.invalid"
        self.assertEqual(redact_public_text(source), source)

    def test_forbidden_matches_return_only_opaque_labels(self):
        self.write_policy()
        hits = forbidden_public_identifiers("private.person@example.invalid and ab12cd3")
        self.assertEqual(hits, ["private_match_1", "private_match_2"])
        self.assertTrue(all("example.invalid" not in hit and "ab12cd3" not in hit for hit in hits))


if __name__ == "__main__":
    unittest.main()
