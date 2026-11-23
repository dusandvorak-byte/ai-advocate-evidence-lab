#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from provenance_hardening_bridge import is_okte_structural_repair, verify_hardening_bridge, verify_unchanged_public_copy_scan


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

    def test_okte_structural_repair_rejects_text_changes(self):
        self.assertTrue(is_okte_structural_repair("qpdf_rewrite", [], None))
        self.assertTrue(is_okte_structural_repair("pymupdf_metadata", [], None))
        self.assertTrue(is_okte_structural_repair("pymupdf_rewrite", [], None))
        self.assertFalse(is_okte_structural_repair("redact", [], None))
        self.assertFalse(is_okte_structural_repair("pymupdf_metadata", [{"page": 1}], None))
        self.assertFalse(is_okte_structural_repair("pymupdf_metadata", [], {}))
        self.assertFalse(is_okte_structural_repair("pymupdf_metadata", None, None))

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



class UnchangedCopyPrivacyProofRegressionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.file = Path(self.tmp.name) / "copy.pdf"
        self.file.write_bytes(b"%PDF-1.4\\npublic-copy\\n%%EOF\\n")
        self.sha = digest(self.file.read_bytes())
        self.inspection = {
            "reasons": [],
            "text_scan_ok": True,
            "decoded_scan_ok": True,
            "qpdf_structurally_valid": True,
            "pdf_revision_markers_bound": True,
            "pdf_single_revision_only": True,
            "visible_private_hits": [],
            "raw_private_hits": [],
            "decoded_private_hits": [],
            "metadata_private_hits": [],
        }

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, **overrides):
        data = {"inspection": self.inspection, "final_public_pdf": self.file, "expected_sha256": self.sha}
        data.update(overrides)
        return verify_unchanged_public_copy_scan(**data)

    def test_clean_unchanged_copy_is_certified(self):
        self.assertTrue(self.check())

    def test_private_hits_fail_closed(self):
        for field in ("visible_private_hits", "raw_private_hits", "decoded_private_hits", "metadata_private_hits"):
            self.assertFalse(self.check(inspection={**self.inspection, field: ["test-private-hit"]}))

    def test_incomplete_or_invalid_scans_fail_closed(self):
        for field in ("text_scan_ok", "decoded_scan_ok", "qpdf_structurally_valid", "pdf_revision_markers_bound", "pdf_single_revision_only"):
            self.assertFalse(self.check(inspection={**self.inspection, field: False}))
        self.assertFalse(self.check(inspection={**self.inspection, "reasons": ["private_match"]}))
        self.assertFalse(self.check(inspection={"reasons": []}))

    def test_tampered_bytes_or_digest_fail(self):
        self.assertFalse(self.check(expected_sha256=digest(b"wrong")))
        self.file.write_bytes(b"changed")
        self.assertFalse(self.check())
        self.file.unlink()
        self.assertFalse(self.check())



if __name__ == "__main__":
    unittest.main()
