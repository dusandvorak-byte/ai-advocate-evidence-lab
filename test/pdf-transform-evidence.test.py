"""Synthetic same-run capture / final-audit / exact-byte reuse regression."""
import copy
import hashlib
from pathlib import Path
import tempfile
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from pdf_transform_snapshot import capture_inputs, build_reuse_plan, CHECKS
from pdf_transform_runtime import comparable_entries, compare_fresh_results, verified_candidate_bytes


class TransformEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.web = self.root / "web"
        self.stage = self.root / "stage"
        self.rel = "documents/test.pdf"
        self.original = b"%PDF-1.4\nsynthetic archived bytes\n%%EOF\n"
        self.output = b"%PDF-1.4\nsynthetic public bytes\n%%EOF\n"
        self.source_sha = hashlib.sha256(self.original).hexdigest()
        self.output_sha = hashlib.sha256(self.output).hexdigest()
        self.write(self.web / self.rel, self.original)
        self.write(self.stage / self.rel, self.output)
        self.write(self.stage / "web" / self.rel, self.output)
        self.origin = dict(repository="dusandvorak-byte/ai-advocate-evidence-lab",
            workflow=".github/workflows/trusted-pdf-shard-diagnostic.yml",
            run_id=1, run_attempt=1, source_commit="1"*40)
        self.rows = {self.rel: [{"id": "test", "public": {"pdf": self.rel}}]}
        self.options = dict(policy_sha="a"*64, identity="b"*64, engine_sha="c"*64,
                            path_policy_sha="d"*64, origin=self.origin)
        self.snapshot = self.capture()
        self.report = {
            "schema_version": "1.1-sliced", "checkout_commit": "1"*40, "github_event_sha": "1"*40,
            "expected_pr_head_commit": "1"*40, "base_is_ancestor": True,
            "summary": {"hard_failure_count": 0, "hard_failures": [],
                        "human_content_privacy_review_still_required": True, "all_final_staged_pdf_count": 2},
            "registry_web_stage_reconciliation": {"staged_set_exact_match": True,
                                                 "id69_absent_from_final_release_state": True},
            "privacy_hardening": {"schema_version": "1.2", "policy_sha256": "a"*64,
                                 "authenticated_private_policy_identity": "b"*64, "hard_failure_count": 0,
                                 "hard_failures": [], "documents": [{
                                     "id": "test", "registered": True, "public_path": self.rel,
                                     "input_sha256": self.source_sha, "output_sha256": self.output_sha,
                                     "changed": True, "page_count": 1, "strategy": "redact",
                                     "redaction_matches": [{"page": 1, "rule": "synthetic"}],
                                     "trigger_reasons": ["private_match"], "text_fallback": None,
                                     "known_private_identifier_hits_after": [],
                                     "decoded_private_identifier_hits_after": [],
                                 }]},
            "all_final_web_pdfs": [{
                "published_path": p, "sha256": self.output_sha, "page_count": 1, "derivative": True,
                "registry_ids": ["test"], "xmp_present": False,
                "checks": {k: True for k in CHECKS | {"derivative_xmp_removed"}}
            } for p in (self.rel, "web/" + self.rel)],
        }

    def write(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def capture(self, **overrides):
        return capture_inputs(web=self.web, by_path=self.rows, **(self.options | overrides))

    def plan(self):
        return build_reuse_plan(snapshot=self.snapshot, report=self.report, stage=self.stage,
                                expected_origin=self.origin)

    def test_exact_audited_redaction_and_unchanged_input(self):
        plan = self.plan()
        self.assertEqual(len(plan["entries"]), 1)
        self.assertFalse(plan["authorization_granted"])
        self.assertFalse(plan["skip_scan_granted"])
        row = comparable_entries(self.capture(), plan)[self.rel]
        self.assertEqual(verified_candidate_bytes(self.web / self.rel, row, self.stage), self.output)
        self.assertEqual((self.web / self.rel).read_bytes(), self.original)

    def test_changed_policy_tool_context_or_source_is_miss(self):
        plan = self.plan()
        for field in ("policy_sha", "identity", "engine_sha", "path_policy_sha"):
            self.assertEqual(comparable_entries(self.capture(**{field: "f"*64}), plan), {})
        self.rows[self.rel][0]["public"]["verification_status"] = "changed"
        self.assertEqual(comparable_entries(self.capture(), plan), {})
        self.rows[self.rel][0]["public"].pop("verification_status")
        self.write(self.web / self.rel, self.original + b"changed")
        self.assertEqual(comparable_entries(self.capture(), plan), {})
        self.assertIsNone(verified_candidate_bytes(self.web / self.rel, plan["entries"][0], self.stage))

    def test_revoked_or_special_path_is_miss(self):
        plan = self.plan()
        self.assertEqual(comparable_entries(self.capture(excluded_paths={self.rel}), plan), {})
        self.rows[self.rel][0]["release_excluded"] = True
        self.assertEqual(comparable_entries(self.capture(), plan), {})

    def test_tampered_mirror_and_audit_are_rejected(self):
        self.write(self.stage / "web" / self.rel, b"tamper")
        with self.assertRaisesRegex(ValueError, "stage bytes"):
            self.plan()
        self.write(self.stage / "web" / self.rel, self.output)
        self.report["all_final_web_pdfs"][0]["checks"].pop("inline_images_absent")
        with self.assertRaisesRegex(ValueError, "incomplete"):
            self.plan()

    def test_failed_audit_or_wrong_source_is_rejected(self):
        self.report["summary"]["hard_failure_count"] = 1
        with self.assertRaisesRegex(ValueError, "audit not clean"):
            self.plan()
        self.report["summary"]["hard_failure_count"] = 0
        self.report["checkout_commit"] = "2"*40
        with self.assertRaisesRegex(ValueError, "source mismatch"):
            self.plan()

    def test_no_fabricated_transform_proof(self):
        row = self.report["privacy_hardening"]["documents"][0]
        for field, value in (("input_sha256", "f"*64), ("text_fallback", {}),
                             ("redaction_matches", []), ("trigger_reasons", ["inspection_timeout"])):
            old = row[field]
            row[field] = value
            self.assertEqual(self.plan()["entries"], [])
            row[field] = old

    def test_shadow_measures_exact_results_and_mismatch(self):
        plan = self.plan()
        current = self.capture()
        self.write(self.web / self.rel, self.output)
        result = dict(rel=self.rel, failures=[], changed=True, before_sha=self.source_sha,
                      after_sha=self.output_sha, before_pages=1, after_pages=1, strategy="redact",
                      matches=[{"page": 1, "rule": "synthetic"}], text_fallback=None)
        stats = compare_fresh_results(current, plan, [result], self.web)
        self.assertEqual((stats["potential_hits"], stats["exact_matches"], stats["skipped"]), (1, 1, 0))
        result["after_sha"] = "f"*64
        stats = compare_fresh_results(current, plan, [result], self.web)
        self.assertEqual(stats["mismatches"], 1)


    def test_shadow_reports_global_identity_miss_without_reuse(self):
        plan = self.plan()
        current = self.capture(engine_sha="f"*64)
        stats = compare_fresh_results(current, plan, [], self.web)
        self.assertEqual(stats["identity_mismatches"], ["engine_sha256"])
        self.assertEqual(stats["prior_entry_count"], 1)
        self.assertEqual(stats["path_identity_matches"], 1)
        self.assertEqual(stats["potential_hits"], 0)
        self.assertEqual(stats["exact_matches"], 0)
        self.assertEqual(stats["skipped"], 0)
        self.assertTrue(stats["fresh_scan_authoritative"])
        self.assertEqual(comparable_entries(current, plan), {})
        self.assertEqual(compare_fresh_results(self.capture(), plan, [], self.web)["identity_mismatches"], [])


class WorkflowOptInTests(unittest.TestCase):
    def test_default_shadow_and_explicit_reuse_only(self):
        import os
        import subprocess
        workflow = (Path(__file__).resolve().parents[1] /
                    ".github/workflows/trusted-pdf-shard-diagnostic.yml").read_text()
        start = workflow.index("      - name: Prepare optional transformation measurement or explicit reuse")
        end = workflow.index("      - name: Materialize trusted public tree", start)
        step = workflow[start:end]
        self.assertIn("if: vars.EVIDENCE_LAB_PDF_TRANSFORM_SHADOW == '1'", step)
        self.assertIn("PDF_TRANSFORM_REUSE_OPT_IN: ${{ vars.EVIDENCE_LAB_PDF_TRANSFORM_REUSE }}", step)
        first = step.index("          mode=shadow")
        last = step.index('          echo "EVIDENCE_LAB_PDF_TRANSFORM_MODE=$mode"', first)
        script = "\n".join(line.strip() for line in step[first:last].splitlines()) + '\nprintf "%s" "$mode"'
        for flag, expected in ((None, "shadow"), ("", "shadow"), ("0", "shadow"),
                               ("true", "shadow"), ("1", "reuse"), ("1; exit 1", "shadow")):
            env = os.environ.copy()
            env.pop("PDF_TRANSFORM_REUSE_OPT_IN", None)
            if flag is not None:
                env["PDF_TRANSFORM_REUSE_OPT_IN"] = flag
            self.assertEqual(subprocess.check_output(["bash", "-eu", "-c", script],
                                                     env=env, text=True), expected)

    def test_fresh_final_audit_not_conditional_on_reuse(self):
        workflow = (Path(__file__).resolve().parents[1] /
                    ".github/workflows/trusted-pdf-shard-diagnostic.yml").read_text()
        self.assertIn("python3 scripts/audit-release-evidence-sliced.py pdf-shard", workflow)
        self.assertIn("python3 scripts/audit-release-evidence-sliced.py assemble 16", workflow)
        self.assertIn("node scripts/verify-approved-ct-pilot.mjs --staged", workflow)
        self.assertEqual(workflow.count("PDF_TRANSFORM_REUSE_OPT_IN"), 2)


if __name__ == "__main__":
    unittest.main()
