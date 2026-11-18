#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from provenance_hardening_bridge import verify_hardening_bridge


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class HardeningBridgeRegressionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.final = self.root / "web" / "documents" / "x.pdf"
        self.final.parent.mkdir(parents=True)
        self.before = b"%PDF-1.4\npre-hardening\n%%EOF\n"
        self.after = b"%PDF-1.4\nhardened-public\n%%EOF\n"
        self.before_sha = digest(self.before)
        self.after_sha = digest(self.after)
        self.final.write_bytes(self.after)
        self.report = {"hard_failure_count": 0}
        self.row = {
            "id": "doc-test",
            "public_path": "documents/x.pdf",
            "input_sha256": self.before_sha,
            "output_sha256": self.after_sha,
        }

    def tearDown(self):
        self.tmp.cleanup()

    def verify(self, **overrides):
        args = {
            "hardening_report": self.report,
            "hardening_row": self.row,
            "document_id": "doc-test",
            "public_path": "documents/x.pdf",
            "input_sha256": self.before_sha,
            "expected_output_sha256": self.after_sha,
            "final_public_pdf": self.final,
        }
        args.update(overrides)
        return verify_hardening_bridge(**args)

    def test_valid_chain_passes(self):
        self.assertTrue(self.verify())

    def test_deleted_final_pdf_fails(self):
        self.final.unlink()
        self.assertFalse(self.verify())

    def test_replaced_final_pdf_fails(self):
        self.final.write_bytes(b"%PDF-1.4\nattacker replacement\n%%EOF\n")
        self.assertFalse(self.verify())

    def test_wrong_final_output_digest_fails(self):
        wrong = dict(self.row, output_sha256=digest(b"wrong"))
        self.assertFalse(self.verify(hardening_row=wrong))

    def test_stale_wrong_report_id_fails(self):
        wrong = dict(self.row, id="different-doc")
        self.assertFalse(self.verify(hardening_row=wrong))

    def test_stale_wrong_report_path_fails(self):
        wrong = dict(self.row, public_path="documents/other.pdf")
        self.assertFalse(self.verify(hardening_row=wrong))

    def test_stale_wrong_input_digest_fails(self):
        wrong = dict(self.row, input_sha256=digest(b"stale input"))
        self.assertFalse(self.verify(hardening_row=wrong))

    def test_nonzero_hard_failures_fail(self):
        self.assertFalse(self.verify(hardening_report={"hard_failure_count": 1}))


if __name__ == "__main__":
    unittest.main()
