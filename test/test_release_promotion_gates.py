#!/usr/bin/env python3
"""Synthetic negative release-promotion regression suite (no private data)."""
import importlib.machinery
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

gates = importlib.machinery.SourceFileLoader(
    "release_gates", str(Path(__file__).resolve().parents[1] / "scripts/verify-release-promotion-gates.py")
).load_module()
TARGET = "a" * 40
MERGE = "b" * 40
PRHEAD = "c" * 40
AUDIT_ID = 345678
EARLY = "2026-11-23T17:00:00Z"
FINISHED = "2026-11-23T18:00:00Z"
LATE = "2026-11-23T19:00:00Z"


def fixture():
    run = dict(
        head_sha=TARGET, event="push", head_branch="main", status="completed",
        conclusion="success", name="Ověřit Evidence Lab 2.0",
        path=".github/workflows/validate-evidence-lab-2.yml@refs/heads/main",
        run_started_at=EARLY, updated_at=FINISHED,
    )
    jobs = [dict(name="Trusted build se secret-backed privacy policy",
                 status="completed", conclusion="success"),
            dict(name="PR kontrola bez přístupu k private Secrets",
                 status="completed", conclusion="skipped")]
    prs = [dict(merge_commit_sha=MERGE, merged_at=FINISHED,
                base=dict(ref="main"), head=dict(sha=PRHEAD),
                user=dict(login="author"))]
    reviews = [dict(user=dict(login="privacy-reviewer", type="User"),
                    author_association="COLLABORATOR",
                    state="APPROVED", commit_id=PRHEAD, submitted_at=LATE,
                    body=f"EVIDENCE-LAB PRIVACY APPROVED target={TARGET} audit_run={AUDIT_ID}")]
    detail = dict(number=123, merge_commit_sha=MERGE, merged_at="2026-11-23T20:00:00Z",
                  merged_by=dict(login="release-operator", type="User"))
    prs[0]["number"] = 123
    return run, jobs, prs, reviews, detail


class PromotionGateTests(unittest.TestCase):
    def test_publisher_wiring_runs_both_gates_before_gh_pages_write(self):
        workflow = (Path(__file__).resolve().parents[1] /
                    ".github/workflows/publish-gh-pages-branch.yml").read_text("utf-8")
        full = workflow.index("name: Vynutit úspěch úplného trusted secret-backed buildu")
        human = workflow.index("name: Vynutit nezávislé lidské potvrzení privacy")
        publish = workflow.index("name: Publikovat ověřené soubory do jediné větve gh-pages")
        self.assertLess(full, human)
        self.assertLess(human, publish)
        self.assertIn("pull-requests: read", workflow)
        for excerpt in (workflow[full:human], workflow[human:publish]):
            self.assertIn("if: env.RELEASE_MODE == 'publish'", excerpt)
        self.assertIn("scripts/verify-release-promotion-gates.py human", workflow[human:publish])
        self.assertIn("gate[\"validate_full_build\"]", workflow[full:human])

    def test_success_only_on_exact_verified_attested_release(self):
        run, jobs, prs, reviews, detail = fixture()
        self.assertTrue(gates.validate_full_build(run, jobs, TARGET))
        self.assertTrue(gates.validate_human_review(
            prs, reviews, "privacy-reviewer", MERGE, TARGET, AUDIT_ID, FINISHED, FINISHED, detail))

    def test_full_build_must_be_trusted_successful_exact_main_push(self):
        for field, wrong in (
            ("head_sha", "0" * 40), ("event", "pull_request"),
            ("head_branch", "feature"), ("conclusion", "failure"),
            ("status", "in_progress"), ("name", "fake workflow"),
            ("path", ".github/workflows/synthetic.yml"),
        ):
            with self.subTest(field=field):
                run, jobs, _, _, _ = fixture()
                run[field] = wrong
                with self.assertRaises(ValueError):
                    gates.validate_full_build(run, jobs, TARGET)

    def test_no_empty_skipped_or_failed_trusted_job(self):
        for job_status in ("skipped", "failure", "cancelled", None):
            with self.subTest(job_status=job_status):
                run, jobs, _, _, _ = fixture()
                jobs[0]["conclusion"] = job_status
                with self.assertRaises(ValueError):
                    gates.validate_full_build(run, jobs, TARGET)
        run, jobs, _, _, _ = fixture()
        with self.assertRaises(ValueError):
            gates.validate_full_build(run, jobs[1:], TARGET)

    def test_privacy_review_cannot_be_forged_or_stale(self):
        cases = (
            ("reviewer-not-allowlisted", "wrong-reviewer"),
            ("wrong-sha", "wrong-sha"),
            ("no-approval", "no-approval"),
            ("comment-instead-of-approved-review", "comment"),
            ("review-before-audit", "too-early"),
            ("self-review", "self"),
            ("bot-review", "bot"),
            ("not-member", "outsider"),
            ("wrong-pr", "wrong-pr"),
            ("edited-head", "wrong-head"),
            ("changed-target-marker", "bad-marker"),
            ("reversed-approval", "dismissal"),
        )
        for title, attack in cases:
            with self.subTest(attack=title):
                _, _, prs, reviews, detail = fixture()
                reviewer = "privacy-reviewer"
                if attack == "wrong-reviewer":
                    reviewer = "another-allowed-reviewer"
                elif attack == "wrong-sha":
                    reviews[0]["commit_id"] = "f" * 40
                elif attack == "no-approval":
                    reviews[0]["state"] = "COMMENTED"
                elif attack == "comment":
                    reviews[0]["state"] = "COMMENTED"
                elif attack == "too-early":
                    reviews[0]["submitted_at"] = EARLY
                elif attack == "self":
                    prs[0]["user"]["login"] = reviewer
                elif attack == "bot":
                    reviews[0]["user"]["type"] = "Bot"
                elif attack == "outsider":
                    reviews[0]["author_association"] = "NONE"
                elif attack == "wrong-pr":
                    prs[0]["merge_commit_sha"] = "f" * 40
                elif attack == "wrong-head":
                    prs[0]["head"]["sha"] = "f" * 40
                elif attack == "bad-marker":
                    reviews[0]["body"] = f"EVIDENCE-LAB PRIVACY APPROVED target={'d'*40} audit_run={AUDIT_ID}"
                elif attack == "dismissal":
                    reviews.append(dict(reviews[0], state="DISMISSED", submitted_at="2026-11-23T20:00:00Z"))
                with self.assertRaises(ValueError):
                    gates.validate_human_review(prs, reviews, reviewer, MERGE, TARGET, AUDIT_ID, FINISHED, FINISHED, detail)

    def test_automated_or_preaudit_merge_is_denied(self):
        _, _, prs, reviews, detail = fixture()
        for wrong in (
            {"merged_by": {"login": "github-actions[bot]", "type": "Bot"}},
            {"merged_at": EARLY},
            {"merged_by": {"login": "privacy-reviewer", "type": "User"}},
            {"merge_commit_sha": "f" * 40},
            {"number": 999},
        ):
            with self.subTest(wrong=wrong):
                copy_detail = dict(detail, **wrong)
                with self.assertRaises(ValueError):
                    gates.validate_human_review(
                        prs, reviews, "privacy-reviewer", MERGE, TARGET, AUDIT_ID,
                        FINISHED, FINISHED, copy_detail)

    def test_missing_reviewer_and_missing_audit_id_fail_closed(self):
        _, _, prs, reviews, detail = fixture()
        for reviewer in ("", "privacy reviewer", "robot[bot]"):
            with self.subTest(reviewer=reviewer):
                with self.assertRaises(ValueError):
                    gates.validate_human_review(prs, reviews, reviewer, MERGE, TARGET, AUDIT_ID, FINISHED, FINISHED, detail)
        with self.assertRaises(ValueError):
            gates.validate_human_review(prs, reviews, "privacy-reviewer", MERGE, TARGET, 0, FINISHED, FINISHED)


if __name__ == "__main__":
    unittest.main()
