import contextlib
import hashlib
import io
import json
import runpy
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

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

    def make_stage(self) -> Path:
        stage = self.web / ".sample.pdf.unit.candidate.pdf"
        shutil.copyfile(self.pdf, stage)
        return stage

    def run_worker(self, *, force_rewrite=False, stage=None):
        stage = stage or self.make_stage()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.ns["worker_candidate"](
                "sample.pdf",
                stage.relative_to(self.web).as_posix(),
                force_rewrite,
                {
                    "page_count": 1,
                    "reasons": [],
                    "text_scan_ok": True,
                    "xmp_present": False,
                    "source_sha256": self.original_sha,
                },
            )
        return json.loads(output.getvalue().strip().splitlines()[-1])["candidate"], stage

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

    def candidate_payload(self, data: bytes, *, failures=None, changed=True) -> dict:
        return {
            "rel": "sample.pdf",
            "strategy": "pymupdf_rewrite",
            "before_sha": self.original_sha,
            "before_pages": 1,
            "after_sha": hashlib.sha256(data).hexdigest(),
            "after_pages": 1,
            "changed": changed,
            "matches": [],
            "text_fallback": None,
            "raw_fallback_hits": [],
            "visible_hits": [],
            "post": clean_post(),
            "failures": list(failures or []),
        }

    def test_worker_uses_parent_stage_and_preserves_canonical_source(self):
        calls = self.install_successful_fallback()
        self.globals["forbidden_public_identifier_byte_hits"] = lambda raw, matchers: []

        candidate, stage = self.run_worker()

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0], (stage, stage))
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
        self.assertTrue(candidate["changed"])
        self.assertTrue(candidate["text_fallback"]["deterministic"])
        self.assertEqual(candidate["text_fallback"]["source_sha256"], self.original_sha)
        self.assertEqual(candidate["text_fallback"]["source_page_count"], 1)
        self.assertEqual(candidate["text_fallback"]["fallback_input_sha256"], "a" * 64)
        self.assertEqual(candidate["text_fallback"]["fallback_input_page_count"], 999)
        self.assertTrue(candidate["strategy"].endswith("+text_fallback"))
        self.assertEqual(candidate["raw_fallback_hits"], [])
        self.assertEqual(candidate["failures"], [])

    def test_clean_worker_never_invokes_fallback_or_mutates_canonical(self):
        self.globals["inspect_pdf_deep"] = lambda path, matchers: clean_post()

        def forbidden_fallback(*args, **kwargs):
            raise AssertionError("clean PDF must not use text fallback")

        def forbidden_raw_scan(*args, **kwargs):
            raise AssertionError("clean PDF must not pay fallback raw scan")

        self.globals["build_public_text_copy"] = forbidden_fallback
        self.globals["forbidden_public_identifier_byte_hits"] = forbidden_raw_scan
        candidate, _ = self.run_worker()

        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
        self.assertFalse(candidate["changed"])
        self.assertIsNone(candidate["text_fallback"])
        self.assertEqual(candidate["strategy"], "verify_only")
        self.assertEqual(candidate["failures"], [])

    def test_worker_exception_never_needs_original_bytes_for_rollback(self):
        self.globals["candidate_strategy"] = lambda before, force: "pymupdf_rewrite"
        self.globals["harden_pdf"] = lambda *args, **kwargs: (b"mutated-intermediate", [])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: unsafe_post()

        def failing_fallback(*args, **kwargs):
            raise RuntimeError("synthetic fallback failure")

        self.globals["build_public_text_copy"] = failing_fallback
        with self.assertRaisesRegex(RuntimeError, "synthetic fallback failure"):
            self.run_worker(force_rewrite=True)
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_intermediate_write_targets_stage_only(self):
        self.globals["candidate_strategy"] = lambda before, force: "pymupdf_rewrite"
        self.globals["harden_pdf"] = lambda *args, **kwargs: (b"mutated-intermediate", [])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: clean_post()
        writes = []

        def atomic_write(path, data):
            writes.append((Path(path), bytes(data)))
            Path(path).write_bytes(data)

        self.globals["atomic_replace_bytes"] = atomic_write
        candidate, stage = self.run_worker(force_rewrite=True)

        self.assertEqual(writes, [(stage, b"mutated-intermediate")])
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
        self.assertTrue(candidate["changed"])

    def test_parent_timeout_leaves_canonical_unchanged_and_cleans_stage(self):
        inspection = {"page_count": 1, "reasons": ["private_match"]}
        with mock.patch.object(
            self.globals["subprocess"],
            "run",
            side_effect=subprocess.TimeoutExpired(["worker"], 330),
        ):
            result = self.ns["process_candidate_isolated"]("sample.pdf", True, inspection)

        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
        self.assertFalse(result["changed"])
        self.assertTrue(any("timed out" in failure for failure in result["failures"]))
        self.assertEqual(list(self.web.glob(".sample.pdf.*.candidate.pdf")), [])

    def test_parent_commits_verified_stage_only_after_worker_success(self):
        inspection = {"page_count": 1, "reasons": ["private_match"]}
        verified = b"verified-staged-pdf"
        observed = {}

        def successful_worker(args, **kwargs):
            self.assertEqual(args[3], "sample.pdf")
            stage = self.web / args[4]
            observed["stage"] = stage
            self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
            stage.write_bytes(verified)
            payload = self.candidate_payload(verified)
            return SimpleNamespace(returncode=0, stdout=json.dumps({"candidate": payload}) + "\n", stderr="")

        with mock.patch.object(self.globals["subprocess"], "run", side_effect=successful_worker):
            result = self.ns["process_candidate_isolated"]("sample.pdf", True, inspection)

        self.assertTrue(result["changed"])
        self.assertEqual(self.pdf.read_bytes(), verified)
        self.assertFalse(observed["stage"].exists())

    def test_parent_discards_failed_stage_and_preserves_canonical(self):
        inspection = {"page_count": 1, "reasons": ["private_match"]}
        rejected = b"rejected-staged-pdf"

        def failed_worker(args, **kwargs):
            stage = self.web / args[4]
            stage.write_bytes(rejected)
            payload = self.candidate_payload(rejected, failures=["synthetic verification failure"])
            return SimpleNamespace(returncode=0, stdout=json.dumps({"candidate": payload}) + "\n", stderr="")

        with mock.patch.object(self.globals["subprocess"], "run", side_effect=failed_worker):
            result = self.ns["process_candidate_isolated"]("sample.pdf", True, inspection)

        self.assertFalse(result["changed"])
        self.assertEqual(result["after_sha"], self.original_sha)
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
        self.assertEqual(list(self.web.glob(".sample.pdf.*.candidate.pdf")), [])

    def test_parent_rejects_worker_provenance_mismatch(self):
        inspection = {"page_count": 1, "reasons": ["private_match"]}
        staged = b"staged-pdf"

        def lying_worker(args, **kwargs):
            stage = self.web / args[4]
            stage.write_bytes(staged)
            payload = self.candidate_payload(staged)
            payload["before_sha"] = "0" * 64
            return SimpleNamespace(returncode=0, stdout=json.dumps({"candidate": payload}) + "\n", stderr="")

        with mock.patch.object(self.globals["subprocess"], "run", side_effect=lying_worker):
            result = self.ns["process_candidate_isolated"]("sample.pdf", True, inspection)

        self.assertFalse(result["changed"])
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
        self.assertTrue(any("provenance" in failure for failure in result["failures"]))

    def test_parent_rejects_stage_source_mismatch_before_worker(self):
        inspection = {"page_count": 1, "reasons": ["private_match"]}
        original_create = self.globals["create_candidate_stage"]

        def mismatched_stage(path):
            stage = original_create(path)
            stage.write_bytes(b"mismatched-stage-source")
            return stage

        self.globals["create_candidate_stage"] = mismatched_stage
        with mock.patch.object(self.globals["subprocess"], "run") as worker:
            result = self.ns["process_candidate_isolated"]("sample.pdf", True, inspection)

        worker.assert_not_called()
        self.assertFalse(result["changed"])
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)
        self.assertTrue(any("stage source SHA" in failure for failure in result["failures"]))
        self.assertEqual(list(self.web.glob(".sample.pdf.*.candidate.pdf")), [])

    def test_parent_refuses_to_overwrite_concurrent_canonical_change(self):
        inspection = {"page_count": 1, "reasons": ["private_match"]}
        verified = b"verified-staged-pdf"
        concurrent = b"concurrent-external-update"

        def successful_worker(args, **kwargs):
            stage = self.web / args[4]
            stage.write_bytes(verified)
            self.pdf.write_bytes(concurrent)
            payload = self.candidate_payload(verified)
            return SimpleNamespace(returncode=0, stdout=json.dumps({"candidate": payload}) + "\n", stderr="")

        with mock.patch.object(self.globals["subprocess"], "run", side_effect=successful_worker):
            result = self.ns["process_candidate_isolated"]("sample.pdf", True, inspection)

        self.assertFalse(result["changed"])
        self.assertEqual(self.pdf.read_bytes(), concurrent)
        self.assertEqual(result["after_sha"], hashlib.sha256(concurrent).hexdigest())
        self.assertTrue(any("changed during privacy hardening" in failure for failure in result["failures"]))
        self.assertEqual(list(self.web.glob(".sample.pdf.*.candidate.pdf")), [])
    def test_raw_private_hit_is_reported_without_touching_canonical(self):
        self.install_successful_fallback()
        self.globals["forbidden_public_identifier_byte_hits"] = (
            lambda raw, matchers: ["private_raw_match_9"]
        )

        candidate, _ = self.run_worker()

        self.assertEqual(candidate["raw_fallback_hits"], ["private_raw_match_9"])
        self.assertTrue(any("raw private identifier" in failure for failure in candidate["failures"]))
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_raw_scan_error_does_not_touch_canonical(self):
        self.install_successful_fallback()

        def failing_raw_scan(*args, **kwargs):
            raise RuntimeError("synthetic raw scan failure")

        self.globals["forbidden_public_identifier_byte_hits"] = failing_raw_scan
        with self.assertRaisesRegex(RuntimeError, "synthetic raw scan failure"):
            self.run_worker()
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_post_fallback_poppler_scan_failure_is_rejected(self):
        calls = self.install_successful_fallback()
        post_failed = clean_post()
        post_failed["text_scan_ok"] = False
        post_failed["reasons"] = ["text_scan_failed"]
        posts = iter([unsafe_post(), post_failed])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: next(posts)
        self.globals["forbidden_public_identifier_byte_hits"] = lambda raw, matchers: []
        self.globals["forbidden_hits_isolated"] = lambda path: ([], True)

        candidate, _ = self.run_worker()

        self.assertEqual(len(calls), 1)
        self.assertFalse(candidate["post"]["text_scan_ok"])
        self.assertTrue(any(
            "visible privacy scan failed after hardening" in failure
            for failure in candidate["failures"]
        ))
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_durable_commit_failure_restores_original_target(self):
        target = self.web / "durable.pdf"
        target.write_bytes(self.original_bytes)
        stage = self.web / ".durable.pdf.unit.candidate.pdf"
        candidate_bytes = b"verified-candidate-pdf"
        stage.write_bytes(candidate_bytes)
        real_fsync = self.globals["os"].fsync

        def fail_directory_fsync(fd):
            if stat.S_ISDIR(self.globals["os"].fstat(fd).st_mode):
                raise OSError("synthetic directory fsync failure")
            return real_fsync(fd)

        with mock.patch.object(
            self.globals["os"],
            "fsync",
            side_effect=fail_directory_fsync,
        ):
            with self.assertRaisesRegex(OSError, "synthetic directory fsync failure"):
                self.ns["commit_candidate_stage"](stage, target)

        self.assertEqual(target.read_bytes(), self.original_bytes)
        self.assertFalse(stage.exists())
        self.assertEqual(list(self.web.glob(".durable.pdf.*.candidate.pdf")), [])


if __name__ == "__main__":
    unittest.main()
