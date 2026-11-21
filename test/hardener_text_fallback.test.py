import contextlib
import io
import json
import runpy
import tempfile
import unittest
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
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
        self.ns = runpy.run_path(str(HARDENER), run_name="hardener_text_fallback_test")
        self.globals = self.ns["worker_candidate"].__globals__
        self.globals["WEB"] = self.web
        self.globals["private_pdf_rules"] = lambda: ([], "synthetic")
        self.globals["prepared_private_byte_matchers"] = lambda: object()
        self.globals["candidate_strategy"] = lambda before, force: "verify_only"

    def tearDown(self):
        self.tmp.cleanup()

    def run_worker(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.ns["worker_candidate"](
                "sample.pdf",
                False,
                {
                    "page_count": 1,
                    "reasons": [],
                    "text_scan_ok": True,
                    "xmp_present": False,
                },
            )
        return json.loads(output.getvalue().strip().splitlines()[-1])["candidate"]

    def test_unsafe_post_scan_triggers_text_fallback_and_clean_recheck(self):
        posts = iter([unsafe_post(), clean_post()])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: next(posts)
        calls = []

        def fallback(source, target, *, redact_text, forbidden_text):
            calls.append((source, target))
            return {
                "source_sha256": "a" * 64,
                "output_sha256": "b" * 64,
                "source_page_count": 1,
                "output_page_count": 1,
                "deterministic": True,
            }

        self.globals["build_public_text_copy"] = fallback
        self.globals["redact_public_text"] = lambda text: text
        self.globals["forbidden_public_identifiers"] = lambda text: []

        candidate = self.run_worker()

        self.assertEqual(len(calls), 1)
        self.assertTrue(candidate["changed"])
        self.assertTrue(candidate["text_fallback"]["deterministic"])
        self.assertTrue(candidate["strategy"].endswith("+text_fallback"))
        self.assertEqual(candidate["failures"], [])
        self.assertEqual(candidate["post"]["reasons"], [])

    def test_clean_post_scan_never_invokes_text_fallback(self):
        self.globals["inspect_pdf_deep"] = lambda path, matchers: clean_post()

        def forbidden_fallback(*args, **kwargs):
            raise AssertionError("clean PDF must not use text fallback")

        self.globals["build_public_text_copy"] = forbidden_fallback
        candidate = self.run_worker()

        self.assertFalse(candidate["changed"])
        self.assertIsNone(candidate["text_fallback"])
        self.assertEqual(candidate["strategy"], "verify_only")
        self.assertEqual(candidate["failures"], [])


if __name__ == "__main__":
    unittest.main()
