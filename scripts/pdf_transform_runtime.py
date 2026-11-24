"""Trusted pre-hardening capture and shadow comparison for exact PDF reuse.

The prior manifest and stage are accepted only after the authenticated
GitHub artifact loader has checked exact run identity and ZIP digests.
This module never skips a scan or writes public bytes.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import time

from pdf_audit_ledger import canonical, valid_origin
from pdf_audit_engine_fingerprint import engine_fingerprint
from pdf_transform_snapshot import capture_inputs, build_reuse_plan

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ".github/workflows/trusted-pdf-shard-diagnostic.yml"
REPO = "dusandvorak-byte/ai-advocate-evidence-lab"
SPECIAL_IDS = {
    "doc-cz-ks-brn-2026-09-03-9-to-315-2026-140",
    "doc-cz-ms-pha-2026-10-02-18-a-17-2026-191",
    "doc-cz-ksz-brn-2026-10-01-1-kzn-1079-2026-41",
    "doc-cz-pcr-pp-2026-10-07-ppr-52605-2-cj-2026-990210-pd",
}


def trusted_origin():
    if not (os.environ.get("GITHUB_ACTIONS") == "true" and
            os.environ.get("GITHUB_EVENT_NAME") == "push" and
            os.environ.get("GITHUB_REF") == "refs/heads/main" and
            os.environ.get("GITHUB_WORKFLOW_REF") == REPO + "/" + WORKFLOW + "@refs/heads/main" and
            os.environ.get("GITHUB_REPOSITORY") == REPO):
        raise ValueError("capture requires trusted main audit workflow")
    origin = dict(repository=REPO, workflow=WORKFLOW, run_id=int(os.environ["GITHUB_RUN_ID"]),
                  run_attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]), source_commit=os.environ["GITHUB_SHA"])
    if not valid_origin(origin):
        raise ValueError("invalid trusted origin")
    return origin


def path_policy_digest(root=ROOT):
    names = ("active-pdf-policy.json", "canonical-pdf-provenance-contract.json",
             "late-original-public-pins-2026-11-24.json",
             "private-redaction-policy-contract.json", "okte-structural-public-copies.json")
    files = {name: hashlib.sha256((root / "project-memory" / name).read_bytes()).hexdigest()
             for name in names}
    return hashlib.sha256(canonical(files)).hexdigest()


def runner_path(value):
    path = Path(value).resolve()
    if not path.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve()) or path.is_relative_to(ROOT):
        raise ValueError("evidence must be outside checkout")
    return path


def capture_current(web, by_path, policy_sha, identity, pins):
    """Called before a single PDF has been transformed."""
    if os.environ.get("EVIDENCE_LAB_PDF_TRANSFORM_MODE") != "shadow":
        return None
    start = time.monotonic()
    origin = trusted_origin()
    excluded = set(pins)
    excluded |= {rel for rel, docs in by_path.items() if any(d.get("id") in SPECIAL_IDS for d in docs)}
    snapshot = capture_inputs(web=web, by_path=by_path, policy_sha=policy_sha, identity=identity,
                              engine_sha=engine_fingerprint(), path_policy_sha=path_policy_digest(),
                              origin=origin, excluded_paths=excluded)
    target = runner_path(os.environ["EVIDENCE_LAB_TRANSFORM_CAPTURE"])
    with target.open("xb") as out:
        out.write(canonical(snapshot) + b"\n")
    print(json.dumps({"event": "pdf-transform-capture", "eligible_input_paths": len(snapshot["inputs"]),
                      "elapsed_ms": round((time.monotonic() - start) * 1000)}), flush=True)
    return snapshot


def comparable_entries(current, prior):
    # Compare exactly the same pre-hardening input bytes and per-path context.
    identity_fields = ("policy_sha256", "private_policy_identity", "engine_sha256")
    if any(current[k] != prior[k] for k in identity_fields):
        return {}
    entries = {}
    for row in prior["entries"]:
        rel = row["rel"]
        old = current["inputs"].get(rel)
        if old and all(old[k] == row[k] for k in ("source_sha256", "context_sha256", "ids")):
            entries[rel] = row
    return entries


def compare_fresh_results(current, prior, results, web):
    from pdf_audit_ledger import file_sha
    entries = comparable_entries(current, prior)
    by_rel = {r["rel"]: r for r in results}
    hits = mismatches = 0
    for rel, row in entries.items():
        result = by_rel.get(rel)
        equal = (result is not None and not result["failures"] and result["changed"] is True and
                 result["before_sha"] == row["source_sha256"] and result["after_sha"] == row["public_sha256"] and
                 result["before_pages"] == row["page_count"] and result["after_pages"] == row["page_count"] and
                 result.get("strategy") == row["strategy"] and result["matches"] == row["redaction_matches"] and
                 result.get("text_fallback") is None and file_sha(Path(web) / rel) == row["public_sha256"])
        hits += int(equal)
        mismatches += int(not equal)
    return {"event": "pdf-transform-shadow", "captured": len(current["inputs"]), "potential_hits": len(entries),
            "exact_matches": hits, "mismatches": mismatches,
            "fresh_scan_authoritative": True, "skipped": 0}


def compare_with_prior(snapshot, results, web):
    if snapshot is None:
        return
    prior_root = os.environ.get("EVIDENCE_LAB_PRIOR_TRANSFORM_ROOT")
    if not prior_root:
        print(json.dumps({"event": "pdf-transform-shadow", "prior_available": False, "skipped": 0}), flush=True)
        return
    base = runner_path(prior_root)
    prior = json.loads((base / "evidence/plan.json").read_bytes())
    captured = json.loads((base / "evidence/snapshot.json").read_bytes())
    report = json.loads((base / "report/release-evidence-audit.json").read_bytes())
    verified = build_reuse_plan(snapshot=captured, report=report, stage=base / "tree/release-site",
                                expected_origin=captured["origin"])
    if prior != verified:
        raise ValueError("previous plan not reproducible from exact audit and stage")
    print(json.dumps(compare_fresh_results(snapshot, verified, results, web)), flush=True)


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 5 or sys.argv[1] != "--assemble":
        raise SystemExit("Usage: --assemble SNAPSHOT REPORT STAGE")
    snapshot_path, report_path, stage = map(Path, sys.argv[2:])
    snapshot_path = runner_path(snapshot_path)
    snapshot = json.loads(snapshot_path.read_bytes())
    report = json.loads(report_path.read_bytes())
    plan = build_reuse_plan(snapshot=snapshot, report=report, stage=stage, expected_origin=trusted_origin())
    with snapshot_path.with_name("plan.json").open("xb") as out:
        out.write(canonical(plan) + b"\n")
    print(json.dumps({"event": "pdf-transform-plan", "eligible": len(plan["entries"]),
                      "rejected": plan["rejected"], "skip_scan_granted": False}), flush=True)
