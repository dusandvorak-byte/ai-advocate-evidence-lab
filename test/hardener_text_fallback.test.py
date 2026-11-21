import contextlib
import hashlib
import io
import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
HARDENER = ROOT / "scripts/harden-public-pdf-privacy.py"


def clean_post(page_count=1):
    return {
        "page_count": page_count,
        "reasons": [],
        "visible_private_hits": [],
        "text_scan_ok": True,
        "decoded_private_hits": [],
        "decoded_scan_ok": True,
        "pdf_revision_markers_bound": True,
        "pdf_single_revision_only": True,
    }


def unsafe_post(page_count=1):
    return {
        "page_count": page_count,
        "reasons": ["private_match"],
        "visible_private_hits": ["private_match_1"],
        "text_scan_ok": True,
        "decoded_private_hits": ["private_raw_match_1"],
        "decoded_scan_ok": True,
        "pdf_revision_markers_bound": True,
        "pdf_single_revision_only": True,
    }


class HardenerTextFallbackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.web = Path(self.tmp.name)
        self.pdf = self.web / "sample.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.save(self.pdf)
        doc.close()
        self.original_bytes = self.pdf.read_bytes()
        self.original_sha = hashlib.sha256(self.original_bytes).hexdigest()
        self.ns = runpy.run_path(str(HARDENER), run_name="hardener_text_fallback_test")
        self.globals = self.ns["worker_candidate"].__globals__
        self.globals["WEB"] = self.web
        self.globals["private_pdf_rules"] = lambda: ([], "synthetic")
        self.globals["prepared_private_byte_matchers"] = lambda: object()
        self.globals["candidate_strategy"] = lambda before, force: "verify_only"

    def tearDown(self):
        self.tmp.cleanup()

    def run_worker(self, *, force_rewrite=False):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.ns["worker_candidate"](
                "sample.pdf",
                force_rewrite,
                {
                    "page_count": 1,
                    "reasons": [],
                    "text_scan_ok": True,
                    "xmp_present": False,
                },
            )
        return json.loads(output.getvalue().strip().splitlines()[-1])["candidate"]

    def install_successful_fallback(self):
        posts = iter([unsafe_post(), clean_post()])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: next(posts)
        calls = []

        def fallback(source, target, *, redact_text, forbidden_text):
            calls.append((source, target))
            return {
                "source_sha256": "a" * 64,
                "output_sha256": "b" * 64,
                "source_page_count": 999,
                "output_page_count": 1,
                "deterministic": True,
            }

        self.globals["build_public_text_copy"] = fallback
        self.globals["redact_public_text"] = lambda text: text
        self.globals["forbidden_public_identifiers"] = lambda text: []
        return calls

    def test_unsafe_post_scan_triggers_text_fallback_and_clean_recheck(self):
        calls = self.install_successful_fallback()
        self.globals["forbidden_public_identifier_byte_hits"] = lambda raw, matchers: []

        candidate = self.run_worker()

        self.assertEqual(len(calls), 1)
        self.assertTrue(candidate["changed"])
        self.assertTrue(candidate["text_fallback"]["deterministic"])
        self.assertEqual(candidate["text_fallback"]["source_sha256"], self.original_sha)
        self.assertEqual(candidate["text_fallback"]["source_page_count"], 1)
        self.assertEqual(candidate["text_fallback"]["fallback_input_sha256"], "a" * 64)
        self.assertEqual(candidate["text_fallback"]["fallback_input_page_count"], 999)
        self.assertTrue(candidate["strategy"].endswith("+text_fallback"))
        self.assertEqual(candidate["raw_fallback_hits"], [])
        self.assertEqual(candidate["failures"], [])
        self.assertEqual(candidate["post"]["reasons"], [])

    def test_clean_post_scan_never_invokes_text_fallback_or_raw_rescan(self):
        self.globals["inspect_pdf_deep"] = lambda path, matchers: clean_post()

        def forbidden_fallback(*args, **kwargs):
            raise AssertionError("clean PDF must not use text fallback")

        def forbidden_raw_scan(*args, **kwargs):
            raise AssertionError("clean PDF must not pay fallback raw scan")

        self.globals["build_public_text_copy"] = forbidden_fallback
        self.globals["forbidden_public_identifier_byte_hits"] = forbidden_raw_scan
        candidate = self.run_worker()

        self.assertFalse(candidate["changed"])
        self.assertIsNone(candidate["text_fallback"])
        self.assertEqual(candidate["strategy"], "verify_only")
        self.assertEqual(candidate["failures"], [])

    def test_fallback_exception_restores_exact_pre_hardening_bytes(self):
        self.globals["candidate_strategy"] = lambda before, force: "pymupdf_rewrite"
        self.globals["harden_pdf"] = lambda *args, **kwargs: (b"mutated-intermediate", [])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: unsafe_post()

        def failing_fallback(*args, **kwargs):
            raise RuntimeError("synthetic fallback failure")

        self.globals["build_public_text_copy"] = failing_fallback
        with self.assertRaisesRegex(RuntimeError, "synthetic fallback failure"):
            self.run_worker(force_rewrite=True)
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_intermediate_and_rollback_writes_are_atomic(self):
        self.globals["candidate_strategy"] = lambda before, force: "pymupdf_rewrite"
        self.globals["harden_pdf"] = lambda *args, **kwargs: (b"mutated-intermediate", [])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: unsafe_post()
        writes = []

        def atomic_write(path, data):
            writes.append(bytes(data))
            Path(path).write_bytes(data)

        def failing_fallback(*args, **kwargs):
            raise RuntimeError("synthetic fallback failure")

        self.globals["atomic_replace_bytes"] = atomic_write
        self.globals["build_public_text_copy"] = failing_fallback
        with self.assertRaisesRegex(RuntimeError, "synthetic fallback failure"):
            self.run_worker(force_rewrite=True)

        self.assertEqual(writes, [b"mutated-intermediate", self.original_bytes])
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_raw_private_hit_after_fallback_fails_and_restores_original(self):
        self.install_successful_fallback()
        self.globals["forbidden_public_identifier_byte_hits"] = (
            lambda raw, matchers: ["private_raw_match_9"]
        )

        candidate = self.run_worker()

        self.assertFalse(candidate["changed"])
        self.assertEqual(candidate["raw_fallback_hits"], ["private_raw_match_9"])
        self.assertTrue(any("raw private identifier" in failure for failure in candidate["failures"]))
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_raw_scan_error_after_fallback_raises_and_restores_original(self):
        self.install_successful_fallback()

        def failing_raw_scan(*args, **kwargs):
            raise RuntimeError("synthetic raw scan failure")

        self.globals["forbidden_public_identifier_byte_hits"] = failing_raw_scan
        with self.assertRaisesRegex(RuntimeError, "synthetic raw scan failure"):
            self.run_worker()
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)


if __name__ == "__main__":
    unittest.main()
