#!/usr/bin/env python3
"""Fail-closed independent release promotion gates for Evidence Lab.

Data comes from GitHub's authenticated REST API, not from untrusted PR prose.
Only a successful main-branch trusted run and an independent reviewed release
attestation for the exact audited parent commit authorize a gh-pages push.
"""
import argparse
import datetime as dt
import json
import re
from pathlib import Path

_SHA = re.compile(r"[0-9a-f]{40}\Z")
_MARKER = "EVIDENCE-LAB PRIVACY APPROVED target={sha} audit_run={run}"


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _timestamp(value):
    _require(isinstance(value, str) and bool(value), "missing timestamp")
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_full_build(run, jobs, target):
    _require(bool(_SHA.fullmatch(target)), "invalid target SHA")
    _require(run.get("head_sha") == target, "trusted build SHA mismatch")
    _require(run.get("event") == "push" and run.get("head_branch") == "main",
             "trusted build must be a main push")
    _require(run.get("status") == "completed" and run.get("conclusion") == "success",
             "trusted full validation did not succeed")
    _require(str(run.get("path") or "").split("@", 1)[0].endswith("/validate-evidence-lab-2.yml"),
             "wrong trusted validation workflow")
    _require(run.get("name") == "Ověřit Evidence Lab 2.0",
             "unexpected trusted workflow identity")
    full = [j for j in jobs if j.get("name") == "Trusted build se secret-backed privacy policy"]
    _require(len(full) == 1, "missing or duplicate secret-backed trusted job")
    _require(full[0].get("status") == "completed" and full[0].get("conclusion") == "success",
             "secret-backed trusted job did not succeed")
    _require(_timestamp(run.get("updated_at")) >= _timestamp(run.get("run_started_at")),
             "invalid trusted run timestamps")
    return True


def validate_human_review(prs, reviews, reviewer, merge_sha, target, audit_run_id,
                          audit_completed, full_completed, pr_detail):
    _require(bool(_SHA.fullmatch(merge_sha)) and bool(_SHA.fullmatch(target)),
             "invalid exact-SHA identity")
    _require(isinstance(reviewer, str) and bool(re.fullmatch(r"[A-Za-z0-9-]{1,39}", reviewer)),
             "dedicated human privacy reviewer not configured")
    _require(isinstance(audit_run_id, int) and audit_run_id > 0,
             "missing pinned trusted audit run")
    merged = [p for p in prs if p.get("merge_commit_sha") == merge_sha
              and p.get("merged_at") and (p.get("base") or {}).get("ref") == "main"]
    _require(len(merged) == 1, "cannot independently identify exact merged authorization PR")
    pr = merged[0]
    _require(isinstance(pr_detail, dict) and pr_detail.get("number") == pr.get("number"),
             "merged PR detail is absent or points to a different PR")
    _require(pr_detail.get("merge_commit_sha") == merge_sha and pr_detail.get("merged_at"),
             "operator verification not bound to exact merged authorization commit")
    operator = pr_detail.get("merged_by") or {}
    _require(operator.get("type") == "User" and
             bool(re.fullmatch(r"[A-Za-z0-9-]{1,39}", operator.get("login") or "")),
             "publication requires an identifiable human operator merge")
    _require(operator["login"].lower() != reviewer.lower(),
             "release operator must be independent from privacy reviewer")
    _require(_timestamp(pr_detail["merged_at"]) >= _timestamp(audit_completed) and
             _timestamp(pr_detail["merged_at"]) >= _timestamp(full_completed),
             "release was merged before trusted audit completion")
    head = (pr.get("head") or {}).get("sha")
    _require(bool(head and _SHA.fullmatch(head)), "invalid authorization PR head")
    author = (pr.get("user") or {}).get("login", "")
    _require(author.lower() != reviewer.lower(), "privacy reviewer must be independent of author")
    review_history = [r for r in reviews if (r.get("user") or {}).get("login", "").lower() == reviewer.lower()]
    _require(bool(review_history), "no trusted human privacy review")
    review_history.sort(key=lambda r: _timestamp(r.get("submitted_at")))
    review = review_history[-1]
    _require((review.get("user") or {}).get("type") == "User",
             "reviewer account is not a human GitHub user")
    _require(review.get("author_association") in {"OWNER", "MEMBER", "COLLABORATOR"},
             "reviewer lacks contributor authority")
    _require(review.get("state") == "APPROVED", "latest privacy review not approved")
    _require(review.get("commit_id") == head, "privacy review not bound to exact PR head")
    _require((review.get("body") or "").strip() ==
             _MARKER.format(sha=target, run=audit_run_id),
             "privacy review missing exact target and audited-run attestation")
    approved_at = _timestamp(review.get("submitted_at"))
    _require(approved_at >= _timestamp(audit_completed),
             "human review predates trusted shard audit")
    _require(approved_at >= _timestamp(full_completed),
             "human review predates trusted full validation")
    _require(_timestamp(pr_detail["merged_at"]) >= approved_at,
             "release operator merged before the human privacy attestation")
    return True


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="mode", required=True)
    full = sub.add_parser("trusted")
    full.add_argument("run")
    full.add_argument("jobs")
    full.add_argument("target")
    human = sub.add_parser("human")
    for arg in ("prs", "reviews", "reviewer", "merge_sha", "target",
                "audit_run_id", "audit_completed", "full_completed", "pr_detail"):
        human.add_argument(arg)
    args = p.parse_args()
    if args.mode == "trusted":
        validate_full_build(json.loads(Path(args.run).read_text()),
                            json.loads(Path(args.jobs).read_text())["jobs"], args.target)
    else:
        validate_human_review(json.loads(Path(args.prs).read_text()),
                              json.loads(Path(args.reviews).read_text()), args.reviewer,
                              args.merge_sha, args.target, int(args.audit_run_id),
                              args.audit_completed, args.full_completed,
                              json.loads(Path(args.pr_detail).read_text()))
    print("EXACT_SHA_RELEASE_PROMOTION_GATES_PASS")


if __name__ == "__main__":
    main()
