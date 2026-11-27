"""Synthetic whole-tree reuse gates. No network, repository secrets or real evidence."""
from datetime import datetime, timezone
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import prepared_tree as p
from pdf_transform_snapshot import CHECKS


class WholeTreeReuseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.tree = self.root / "tree"
        self.origin = {"repository": p.helper.REPO, "workflow": p.helper.WORKFLOW,
                       "run_id": 1, "run_attempt": 1, "source_commit": "a"*40}
        self.facts = {"source_tree": "b"*64, "dates": p.days(), "engine": "c"*64,
                      "policy_sha": "d"*64, "policy_identity": "e"*64}
        registry = b'{"documents":[]}\n'
        pdf = b"%PDF-1.4\nsynthetic bytes\n%%EOF\n"
        self.write("tree/project-memory/documents-2026.json", registry)
        self.write("tree/web/data/documents-2026.json", registry)
        self.write("tree/web/docs/a.pdf", pdf)
        self.write("tree/release-site/data/documents-2026.json", registry)
        self.write("tree/release-site/web/data/documents-2026.json", registry)
        for prefix in ("", "web/"):
            self.write("tree/release-site/" + prefix + "docs/a.pdf", pdf)
            self.write("tree/release-site/" + prefix + ".source-commit", b"a"*40+b"\n")
            self.write("tree/release-site/" + prefix + ".nojekyll", b"")
        hardening = {"schema_version": "1.2", "policy_sha256": "d"*64,
                     "authenticated_private_policy_identity": "e"*64,
                     "hard_failure_count": 0, "hard_failures": [], "documents": []}
        self.write("tree/project-memory/privacy-hardening-report.json", p.canonical(hardening))
        self.report = {"schema_version": "1.1-sliced", "checkout_commit": "a"*40,
                       "github_event_sha": "a"*40, "expected_pr_head_commit": "a"*40,
                       "base_is_ancestor": True, "privacy_hardening": hardening,
                       "summary": {"hard_failure_count": 0, "hard_failures": [],
                                   "human_content_privacy_review_still_required": True,
                                   "all_final_staged_pdf_count": 2},
                       "registry_web_stage_reconciliation": {"staged_set_exact_match": True,
                                                              "id69_absent_from_final_release_state": True},
                       "all_final_web_pdfs": [{"published_path": rel, "sha256": p.digest(pdf),
                                               "page_count": 1, "derivative": False,
                                               "checks": dict.fromkeys(CHECKS, True)}
                                              for rel in ("docs/a.pdf", "web/docs/a.pdf")]}
        self.write("report/release-evidence-audit.json", p.canonical(self.report))
        self.stamp = {"schema": 2, "scope": "full-materialization-inputs", "mode": "full",
                      "origin": self.origin, "inputs": self.facts, "outputs": p.output_evidence(self.tree, archived=True)}

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def test_only_exact_refresh_marker_ignored(self):
        a = b"100644 blob "+b"a"*40+b"\tweb/index.html\0"
        b = b"100644 blob "+b"b"*40+b"\t"+p.HEARTBEAT.encode()+b"\0"
        self.assertEqual(p.build_input_sha(a), p.build_input_sha(a+b))
        self.assertNotEqual(p.build_input_sha(a), p.build_input_sha(a+b.replace(p.HEARTBEAT.encode(), b"ops/other.md")))
        with self.assertRaises(ValueError):
            p.build_input_sha(a+b.replace(b"100644", b"120000"))

    def test_authorization_is_separate_from_materialization_identity(self):
        def row(name, sha):
            return b"100644 blob " + sha.encode()*40 + b"\t" + name.encode() + b"\0"
        web = row("web/index.html", "a")
        auth = row(p.AUTHORIZATION, "b")
        self.assertEqual(p.build_input_sha(web+auth), p.build_input_sha(web+row(p.AUTHORIZATION, "c")))
        with self.assertRaises(ValueError):
            p.build_input_sha(web+auth.replace(b"100644", b"120000"))
        self.assertNotEqual(p.build_input_sha(web+auth), p.build_input_sha(web+row("scripts/build-site.mjs", "c")))

    def test_exact_v1_seed_migration(self):
        def row(name, sha):
            return b"100644 blob " + sha.encode()*40 + b"\t" + name.encode() + b"\0"
        web = row("web/index.html", "a")
        old = web + row(p.AUTHORIZATION, "b") + row("ops/whole-tree-reuse/prepared_tree.py", "c")
        new = web + row(p.AUTHORIZATION, "d") + row("ops/whole-tree-reuse/prepared_tree.py", "e")
        facts = self.facts | {"source_tree": p.build_input_sha(new)}
        original_facts = facts | {"source_tree": p.build_input_sha(old, {p.HEARTBEAT})}
        origin = self.origin | {"source_commit": p.LEGACY_SEED}
        stamp = self.stamp | {"schema": 1, "origin": origin, "inputs": original_facts}
        with patch.object(p, "git", side_effect=[old, new]):
            expected = p.prior_expected_facts(stamp, origin, facts)
            self.assertEqual(expected, original_facts)
            self.assertTrue(p.matching_stamp(stamp, origin, expected))
            self.assertFalse(p.matching_stamp(stamp | {"inputs": facts}, origin, expected))
        changed = new.replace(web, row("web/index.html", "f"))
        with patch.object(p, "git", side_effect=[old, changed]):
            self.assertIsNone(p.prior_expected_facts(stamp, origin, facts | {"source_tree": p.build_input_sha(changed)}))
        self.assertIsNone(p.prior_expected_facts(stamp, self.origin, facts))

    def test_midnight_prague_and_utc_are_distinct(self):
        self.assertEqual(p.days(datetime(2026, 11, 27, 23, 30, tzinfo=timezone.utc)),
                         ["2026-11-27", "2026-11-28"])

    def test_mismatch_and_expiry_reject(self):
        self.assertTrue(p.matching_stamp(self.stamp, self.origin, self.facts))
        for name in ("source_tree", "engine", "policy_identity", "dates"):
            self.assertFalse(p.matching_stamp(self.stamp, self.origin, self.facts | {name: "changed"}))
        self.assertFalse(p.matching_stamp(self.stamp | {"mode": "reuse"}, self.origin, self.facts))
        with patch.object(p, "days", return_value=["2000-01-01", "2000-01-01"]):
            self.assertFalse(p.matching_stamp(self.stamp, self.origin, self.facts))

    def test_exact_prior_and_tamper(self):
        p.verify_prior(self.root, self.stamp, self.origin, self.facts)
        self.write("tree/web/docs/a.pdf", b"tampered")
        with self.assertRaisesRegex(ValueError, "output digest"):
            p.verify_prior(self.root, self.stamp, self.origin, self.facts)

    def test_audit_failure_and_wrong_pdf_bytes_rejected(self):
        for bad in ("hard_failure", "wrong_hash", "wrong_source"):
            report = copy.deepcopy(self.report)
            if bad == "hard_failure":
                report["summary"]["hard_failure_count"] = 1
            elif bad == "wrong_hash":
                report["all_final_web_pdfs"][0]["sha256"] = "f"*64
            else:
                report["checkout_commit"] = "f"*40
            self.write("report/release-evidence-audit.json", p.canonical(report))
            with self.assertRaises(ValueError):
                p.verify_prior(self.root, self.stamp, self.origin, self.facts)

    def test_archive_hidden_file_rejected(self):
        self.write("tree/web/.unexpected", b"bad")
        with self.assertRaises(ValueError):
            p.output_evidence(self.tree, archived=True)

    def test_legacy_fetch_validation_exit_falls_back_before_restore(self):
        run = {"id": 1, "run_attempt": 1, "head_sha": "a"*40}
        current = self.origin | {"run_id": 2, "source_commit": "f"*40}
        listing = {"artifacts": [
            {"id": i, "name": name + run["head_sha"], "expired": False, "digest": "sha256:"+"f"*64}
            for i, name in enumerate(("whole-tree-inputs-", "trusted-public-tree-",
                                      "evidence-lab-pdf-shard-diagnostic-"), 1)]}
        with patch.object(p, "trusted_origin", return_value=current), patch.object(p, "inputs", return_value=self.facts), \
                patch.object(p.helper, "api", side_effect=[{"workflow_runs": [run]}, listing]), \
                patch.object(p.subprocess, "run") as git, \
                patch.object(p, "download_stamp", return_value=self.stamp), \
                patch.object(p.helper, "fetch", side_effect=SystemExit("artifact mismatch")), \
                patch.object(p, "restore") as restore:
            git.return_value.returncode = 0
            self.assertEqual(p.prepare(self.root / "rejected"), "full")
            restore.assert_not_called()

    def test_reconstruct_before_restore_and_fail_closed(self):
        calls = []
        with patch.object(p, "trusted_origin", return_value=self.origin), patch.object(p, "inputs", return_value=self.facts), \
                patch.object(p, "find_prior", return_value=(self.tree, self.origin)), \
                patch.object(p, "reconstruct_source_provenance", side_effect=lambda: calls.append("source")), \
                patch.object(p, "restore", side_effect=lambda tree: calls.append("restore")):
            self.assertEqual(p.prepare(self.root / "replay"), "reuse")
        self.assertEqual(calls, ["source", "restore"])
        with patch.object(p, "trusted_origin", return_value=self.origin), patch.object(p, "inputs", return_value=self.facts), \
                patch.object(p, "find_prior", return_value=(self.tree, self.origin)), \
                patch.object(p, "reconstruct_source_provenance", side_effect=OSError("source failure")), \
                patch.object(p, "restore") as restore:
            with self.assertRaises(OSError):
                p.prepare(self.root / "failed-replay")
            restore.assert_not_called()

    def test_lookup_failure_falls_back_but_restore_failure_is_fatal(self):
        with patch.object(p, "trusted_origin", return_value=self.origin), patch.object(p, "inputs", return_value=self.facts):
            with patch.object(p, "find_prior", side_effect=ValueError("private details")):
                self.assertEqual(p.prepare(self.root / "miss"), "full")
            with patch.object(p, "find_prior", return_value=(self.tree, self.origin)), patch.object(p, "reconstruct_source_provenance"), patch.object(p, "restore", side_effect=OSError("failure")):
                with self.assertRaises(OSError):
                    p.prepare(self.root / "fatal")


if __name__ == "__main__":
    unittest.main()
