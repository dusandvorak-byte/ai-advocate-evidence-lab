#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from provenance_hardening_bridge import is_okte_structural_repair, verify_hardening_bridge, verify_unchanged_public_copy_scan, certify_four_record_public_copy


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
            "scanned_sha256_before": self.sha,
            "scanned_sha256_after": self.sha,
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

    def test_fast_only_scan_is_never_enough(self):
        fast_only = {key: value for key, value in self.inspection.items()
                     if key not in ("decoded_scan_ok", "decoded_private_hits")}
        self.assertFalse(self.check(inspection=fast_only))

    def test_scan_must_bind_exact_bytes_before_and_after(self):
        for field in ("scanned_sha256_before", "scanned_sha256_after"):
            self.assertFalse(self.check(inspection={**self.inspection, field: digest(b"other")}))
            self.assertFalse(self.check(inspection={k: v for k, v in self.inspection.items() if k != field}))

    def test_stale_marker_is_not_proof_of_scanned_bytes(self):
        stale = {**self.inspection, "scanned_sha256_before": digest(b"old")}
        self.assertFalse(self.check(inspection=stale))

    def test_tampered_bytes_or_digest_fail(self):
        self.assertFalse(self.check(expected_sha256=digest(b"wrong")))
        self.file.write_bytes(b"changed")
        self.assertFalse(self.check())
        self.file.unlink()
        self.assertFalse(self.check())





class ProductionFourRecordSnapshotTest(unittest.TestCase):
    """Exercises the same production decision function invoked by main."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "web"
        self.root.mkdir()
        self.rel = "documents/public.pdf"
        self.pdf = self.root / self.rel
        self.pdf.parent.mkdir()
        self.pdf.write_bytes(b"%PDF-1.4\\ntext-copy\\n%%EOF\\n")
        self.sha = digest(self.pdf.read_bytes())
        self.original_sha = digest(b"source original")
        self.item = {
            "id": "doc-test", "public": {
                "pdf": self.rel,
                "sha256": self.sha,
                "source_original_sha256": self.original_sha,
                "verification_status": "verified_deterministic_public_text_copy; not_byte_identical_original; publication_policy_hardened",
            },
        }
        self.calls = []

    def tearDown(self):
        self.tmp.cleanup()

    def clean_scan(self, scanned):
        self.calls.append(scanned)
        self.assertNotEqual(scanned, self.pdf)
        self.assertEqual(scanned.read_bytes(), self.pdf.read_bytes())
        self.assertNotEqual(scanned.stat().st_ino, self.pdf.stat().st_ino)
        self.assertTrue(str(scanned).startswith("/proc/"))
        with self.assertRaises(PermissionError):
            scanned.write_bytes(b"cannot-rewrite-sealed-pdf")
        return {
            "reasons": [], "text_scan_ok": True, "decoded_scan_ok": True,
            "qpdf_structurally_valid": True,
            "pdf_revision_markers_bound": True, "pdf_single_revision_only": True,
            "visible_private_hits": [], "raw_private_hits": [],
            "decoded_private_hits": [], "metadata_private_hits": [],
            "page_count": 1,
        }

    def run_caller(self, scan=None):
        return certify_four_record_public_copy(
            item=self.item,
            expected_original_sha256=self.original_sha,
            expected_public_path=self.rel,
            web_root=self.root,
            deep_scan=scan or self.clean_scan,
        )

    def test_clean_snapshot_passes_and_exact_snapshot_is_promoted(self):
        old_inode = self.pdf.stat().st_ino
        row = self.run_caller()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(row["strategy"], "kernel_sealed_authenticated_deep_scan")
        self.assertEqual(row["output_sha256"], self.sha)
        self.assertEqual(self.pdf.read_bytes(), b"%PDF-1.4\\ntext-copy\\n%%EOF\\n")
        self.assertNotEqual(old_inode, self.pdf.stat().st_ino)
        self.assertEqual(self.item["public"]["verification_status"].count("publication_policy_hardened"), 1)

    def test_existing_marker_never_skips_scan(self):
        with self.assertRaises(RuntimeError):
            self.run_caller(lambda path: {"reasons": [], "text_scan_ok": True})
        self.assertEqual(self.pdf.read_bytes(), b"%PDF-1.4\\ntext-copy\\n%%EOF\\n")

    def test_decoded_only_hit_fails_even_with_existing_marker(self):
        def compromised(scanned):
            result = self.clean_scan(scanned)
            result["decoded_private_hits"] = ["synthetic-private-marker"]
            return result
        with self.assertRaises(RuntimeError):
            self.run_caller(compromised)
        self.assertEqual(len(self.calls), 1)

    def test_fast_only_scan_fails_production_caller(self):
        def fast_only(scanned):
            result = self.clean_scan(scanned)
            result.pop("decoded_scan_ok")
            result.pop("decoded_private_hits")
            return result
        with self.assertRaises(RuntimeError):
            self.run_caller(fast_only)

    def test_replaced_source_during_snapshot_scan_fails(self):
        def replace_original(scanned):
            result = self.clean_scan(scanned)
            self.pdf.write_bytes(b"attacker-mutation")
            return result
        with self.assertRaises(RuntimeError):
            self.run_caller(replace_original)
        self.assertEqual(self.pdf.read_bytes(), b"attacker-mutation")
        self.assertNotIn("publication_policy_hardened; publication_policy_hardened", self.item["public"]["verification_status"])

    def test_same_uid_path_swap_cannot_change_kernel_sealed_scan(self):
        def adversarial_scan(scanned):
            result = self.clean_scan(scanned)
            with self.assertRaises(PermissionError):
                scanned.write_bytes(b"replacement data")
            # Replacing the public source path cannot change the sealed FD.
            self.pdf.write_bytes(b"source-path-mutation")
            self.assertEqual(scanned.read_bytes(), b"%PDF-1.4\\ntext-copy\\n%%EOF\\n")
            return result
        with self.assertRaises(RuntimeError):
            self.run_caller(adversarial_scan)
        self.assertEqual(self.pdf.read_bytes(), b"source-path-mutation")

    def test_tampered_snapshot_fails(self):
        def tamper_snapshot(scanned):
            result = self.clean_scan(scanned)
            scanned.chmod(0o600)
            scanned.write_bytes(b"mutated-snapshot")
            return result
        with self.assertRaises(RuntimeError):
            self.run_caller(tamper_snapshot)

    def test_wrong_expected_digest_and_source_provenance_fail(self):
        self.item["public"]["sha256"] = digest(b"wrong")
        with self.assertRaises(RuntimeError):
            self.run_caller()
        self.item["public"]["sha256"] = self.sha
        self.item["public"]["source_original_sha256"] = digest(b"other original")
        with self.assertRaises(RuntimeError):
            self.run_caller()

    def test_symlink_path_fails_closed(self):
        other = self.pdf.with_name("other.pdf")
        self.pdf.rename(other)
        self.pdf.symlink_to(other)
        with self.assertRaises(RuntimeError):
            self.run_caller()

    def test_all_deep_scan_gates_are_fail_closed(self):
        for field in ("text_scan_ok", "decoded_scan_ok", "qpdf_structurally_valid", "pdf_revision_markers_bound", "pdf_single_revision_only"):
            def bad(scanned, field=field):
                result = self.clean_scan(scanned)
                result[field] = False
                return result
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                self.run_caller(bad)



if __name__ == "__main__":
    unittest.main()
