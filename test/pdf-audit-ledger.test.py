"""Synthetic tests: no repository PDFs, real policy or production signing key."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import pdf_audit_ledger as ledger


def fixture_facts():
    facts = {k: True for k in ledger.TRUE_FIELDS}
    facts.update({k: False for k in ledger.FALSE_FIELDS})
    facts.update({k: 0 for k in ledger.ZERO_FIELDS})
    facts.update({k: [] for k in ledger.EMPTY_FIELDS})
    facts.update(page_count=2, pdf_header_offset=0, pdf_eof_count=1, pdf_startxref_count=1,
                 xmp_present=False, public_copy_notice_present=True, not_byte_identical_notice_present=True,
                 text_extraction_engines=["qpdf/qdf", "PyMuPDF", "pdftotext/poppler"],
                 metadata_keys_present=["format"], content_privacy_signals={"email_like_count": 0,
                 "czech_birth_number_like_count": 0, "phone_like_count": 0},
                 machine_privacy_status="NO_OBVIOUS_HIGH_RISK_PATTERN", qpdf_check_tail="not stored")
    return facts


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.checkout = self.root / "repo"
        self.checkout.mkdir()
        self.pdf = self.checkout / "test.pdf"
        self.pdf.write_bytes(b"%PDF-1.4\nsynthetic only\n%%EOF\n")
        self.store = self.root / "cache"
        self.key = b"k" * 32
        self.ledger = ledger.Ledger(self.store, self.key, self.checkout)
        self.identity = dict(policy_sha="a"*64, private_policy_identity="b"*64, engine_sha="c"*64)
        self.origin = dict(repository="dusandvorak-byte/ai-advocate-evidence-lab",
            workflow=".github/workflows/trusted-pdf-shard-diagnostic.yml", run_id=1, run_attempt=1, source_commit="d"*40)

    def record(self, facts=None):
        return self.ledger.record(pdf_path=self.pdf, expected_pdf_sha=ledger.file_sha(self.pdf),
            facts=fixture_facts() if facts is None else facts, origin=self.origin, **self.identity)

    def lookup(self, **override):
        return self.ledger.lookup(pdf_path=self.pdf, **(self.identity | override))

    def test_persists_between_instances_and_does_not_grant_human_review(self):
        self.assertIsNone(self.lookup())
        self.assertTrue(self.record())
        self.ledger = ledger.Ledger(self.store, self.key, self.checkout)
        self.assertTrue(self.lookup()["human_privacy_review_required"])
        self.assertEqual(self.lookup()["qpdf_check_tail"], "")

    def test_input_byte_change_invalidates(self):
        self.assertTrue(self.record())
        self.pdf.write_bytes(self.pdf.read_bytes() + b"changed")
        self.assertIsNone(self.lookup())

    def test_policy_engine_and_authenticated_identity_changes_invalidate(self):
        self.assertTrue(self.record())
        for name in self.identity:
            self.assertIsNone(self.lookup(**{name: "e"*64}))

    def test_tampering_invalidates(self):
        self.assertTrue(self.record())
        path = next(self.ledger.entries.glob("*.json"))
        data = json.loads(path.read_text())
        data["payload"]["facts"]["page_count"] = 1
        path.write_text(json.dumps(data))
        self.assertIsNone(self.lookup())

    def test_wrong_signing_key_invalidates(self):
        self.assertTrue(self.record())
        self.ledger = ledger.Ledger(self.store, b"x"*32, self.checkout)
        self.assertIsNone(self.lookup())

    def test_failed_incomplete_or_unknown_facts_not_recorded(self):
        for field, value in [("decoded_stream_scan_ok", False), ("qpdf_structurally_valid", False),
                             ("embedded_file_count", 1), ("known_private_identifier_hits", ["test"]),
                             ("new_security_field", True)]:
            facts = fixture_facts() | {field: value}
            self.assertFalse(self.record(facts))
        facts = fixture_facts()
        del facts["pdf_eof_present"]
        self.assertFalse(self.record(facts))

    def test_human_review_flag_preserved(self):
        facts = fixture_facts()
        facts["content_privacy_signals"]["phone_like_count"] = 1
        facts["machine_privacy_status"] = "FLAGGED_FOR_HUMAN_CONTENT_REVIEW"
        self.assertTrue(self.record(facts))
        self.assertEqual(self.lookup()["machine_privacy_status"], "FLAGGED_FOR_HUMAN_CONTENT_REVIEW")

    def test_public_or_weak_store_rejected(self):
        with self.assertRaises(ValueError):
            ledger.Ledger(self.checkout / "web" / "cache", self.key, self.checkout)
        with self.assertRaises(ValueError):
            ledger.Ledger(self.store, b"short", self.checkout)

    def test_symlink_pdf_rejected(self):
        self.assertTrue(self.record())
        real = self.checkout / "other.pdf"
        self.pdf.rename(real)
        self.pdf.symlink_to(real)
        self.assertIsNone(self.lookup())


if __name__ == "__main__":
    unittest.main()
