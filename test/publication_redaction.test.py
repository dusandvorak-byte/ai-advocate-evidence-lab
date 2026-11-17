import hashlib
import hmac
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import publication_redaction as redaction
from publication_redaction import RedactionPolicyError

PUBLIC_CONTRACT = json.loads((ROOT / "project-memory/private-redaction-policy-contract.json").read_text("utf-8"))


class PublicationRedactionTests(unittest.TestCase):
    def setUp(self):
        self.original_policy = os.environ.get("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY")
        self.original_key = os.environ.get("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY")
        self.original_contract_path = redaction.CONTRACT_PATH
        self.tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmp.name)
        self.policy_path = self.tmpdir / "private-policy.json"
        self.contract_path = self.tmpdir / "public-contract.json"
        redaction.CONTRACT_PATH = self.contract_path
        self.key = "synthetic-hmac-key-for-tests-only"
        os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY"] = self.key

    def tearDown(self):
        redaction.CONTRACT_PATH = self.original_contract_path
        if self.original_policy is None:
            os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY", None)
        else:
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = self.original_policy
        if self.original_key is None:
            os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY", None)
        else:
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY"] = self.original_key
        self.tmp.cleanup()

    def policy_payload(self):
        return {
            "policy_id": PUBLIC_CONTRACT["policy_id"],
            "revision": PUBLIC_CONTRACT["revision"],
            "revision_token": PUBLIC_CONTRACT["revision_token"],
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

    def canonical(self, payload):
        signed = {
            "policy_id": payload.get("policy_id"),
            "revision": payload.get("revision"),
            "revision_token": payload.get("revision_token"),
            "rules": payload.get("rules") or [],
            "forbidden": payload.get("forbidden") or [],
        }
        return json.dumps(signed, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

    def write_policy_and_contract(self, payload=None, *, approved_payload=None):
        payload = payload or self.policy_payload()
        approved_payload = approved_payload or payload
        approved_hmac = hmac.new(self.key.encode("utf-8"), self.canonical(approved_payload), hashlib.sha256).hexdigest()
        contract = dict(PUBLIC_CONTRACT)
        contract["approved_policy_hmac"] = approved_hmac
        self.contract_path.write_text(json.dumps(contract), "utf-8")
        self.policy_path.write_text(json.dumps(payload), "utf-8")
        os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = str(self.policy_path)

    def test_requires_private_policy(self):
        contract = dict(PUBLIC_CONTRACT)
        contract["approved_policy_hmac"] = "0" * 64
        self.contract_path.write_text(json.dumps(contract), "utf-8")
        os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY", None)
        with self.assertRaises(RedactionPolicyError):
            redaction.redact_public_text("synthetic input")

    def test_rejects_private_policy_inside_public_repository(self):
        # Use the real public repository path only to test path containment; contents are synthetic.
        redaction.CONTRACT_PATH = ROOT / "project-memory/private-redaction-policy-contract.json"
        local = ROOT / ".tmp-public-policy-test.json"
        try:
            local.write_text(json.dumps(self.policy_payload()), "utf-8")
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = str(local)
            with self.assertRaises(RedactionPolicyError):
                redaction.redact_public_text("synthetic input")
        finally:
            local.unlink(missing_ok=True)

    def test_rejects_tampered_policy_with_same_revision_and_token(self):
        approved = self.policy_payload()
        tampered = json.loads(json.dumps(approved))
        tampered["rules"][0]["replacement"] = "[tampered replacement]"
        self.write_policy_and_contract(tampered, approved_payload=approved)
        with self.assertRaises(RedactionPolicyError):
            redaction.redact_public_text("private.person@example.invalid")

    def test_rejects_unsupported_forbidden_mode(self):
        payload = self.policy_payload()
        payload["forbidden"][0]["mode"] = "litrael"
        self.write_policy_and_contract(payload)
        with self.assertRaises(RedactionPolicyError):
            redaction.forbidden_public_identifiers("private.person@example.invalid")

    def test_synthetic_private_values_are_redacted(self):
        self.write_policy_and_contract()
        source = """Public Person
born 3. 2. 1974
SecretTown 42, 123 45
Exampleville
ID: ab12cd3
private.person@example.invalid
"""
        public = redaction.redact_public_text(source)
        self.assertIn("Public Person", public)
        self.assertIn("1974", public)
        self.assertNotIn("3. 2. 1974", public)
        self.assertNotIn("SecretTown 42", public)
        self.assertNotIn("ab12cd3", public)
        self.assertNotIn("private.person@example.invalid", public)
        self.assertEqual(redaction.forbidden_public_identifiers(public), [])

    def test_unlisted_institutional_contact_is_preserved(self):
        self.write_policy_and_contract()
        source = "Office: public.registry@example.invalid"
        self.assertEqual(redaction.redact_public_text(source), source)

    def test_forbidden_matches_return_only_opaque_labels(self):
        self.write_policy_and_contract()
        hits = redaction.forbidden_public_identifiers("private.person@example.invalid and ab12cd3")
        self.assertEqual(hits, ["private_match_1", "private_match_2"])
        self.assertTrue(all("example.invalid" not in hit and "ab12cd3" not in hit for hit in hits))

    def test_verified_identity_is_authenticated_hmac(self):
        self.write_policy_and_contract()
        identity = redaction.verified_private_policy_identity()
        self.assertRegex(identity, r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
