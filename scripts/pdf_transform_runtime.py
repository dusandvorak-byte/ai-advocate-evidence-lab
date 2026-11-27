"""Trusted pre-hardening capture and shadow comparison for exact PDF reuse.

The prior manifest and stage are accepted only after the authenticated
GitHub artifact loader has checked exact run identity and ZIP digests.
The shadow mode never changes results. Experimental reuse returns exact
validated bytes to the hardener's atomic commit path; full final audit remains.
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
    "doc-cz-dd-2026-11-03-okte-srovnavaci-analyza",
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
    if os.environ.get("EVIDENCE_LAB_PDF_TRANSFORM_MODE") not in ("shadow", "reuse"):
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


def compare_fresh_results(current, prior, results, web, inspections=None):
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
        if row["strategy"] == "unchanged_clean":
            inspection = (inspections or {}).get(rel, {})
            equal = (result is None and inspection.get("reasons") == [] and
                     inspection.get("source_sha256") == row["source_sha256"] and
                     inspection.get("page_count") == row["page_count"] and
                     inspection.get("xmp_present") is False and
                     inspection.get("decoded_scan_ok") is True and
                     inspection.get("decoded_private_hits") == [] and
                     inspection.get("text_scan_ok") is True and
                     inspection.get("qpdf_structurally_valid") is True and
                     inspection.get("pdf_revision_markers_bound") is True and
                     inspection.get("pdf_single_revision_only") is True and
                     file_sha(Path(web) / rel) == row["source_sha256"] == row["public_sha256"])
        hits += int(equal)
        mismatches += int(not equal)
    # Diagnostic counts only. Matching per-path identity does not authorize
    # reuse when a global policy or engine fingerprint differs.
    fields = ("policy_sha256", "private_policy_identity", "engine_sha256")
    identity_mismatches = [k for k in fields if current[k] != prior[k]]
    path_matches = sum(
        1 for row in prior["entries"]
        if row["rel"] in current["inputs"] and all(
            current["inputs"][row["rel"]][k] == row[k]
            for k in ("source_sha256", "context_sha256", "ids"))
    )
    return {"event": "pdf-transform-shadow", "captured": len(current["inputs"]), "potential_hits": len(entries),
            "exact_matches": hits, "mismatches": mismatches,
            "identity_mismatches": identity_mismatches,
            "prior_entry_count": len(prior["entries"]),
            "path_identity_matches": path_matches,
            "fresh_scan_authoritative": True, "skipped": 0}


def load_verified_prior():
    prior_root = os.environ.get("EVIDENCE_LAB_PRIOR_TRANSFORM_ROOT")
    if not prior_root:
        return None
    trusted_origin()
    base = runner_path(prior_root)
    prior = json.loads((base / "evidence/plan.json").read_bytes())
    captured = json.loads((base / "evidence/snapshot.json").read_bytes())
    report = json.loads((base / "report/release-evidence-audit.json").read_bytes())
    run = json.loads((base / "run.json").read_bytes())
    origin = captured["origin"]
    if (run["id"] != origin["run_id"] or run["run_attempt"] != origin["run_attempt"] or
        run["head_sha"] != origin["source_commit"] or run["status"] != "completed" or
        run["conclusion"] != "success" or run["head_branch"] != "main" or
        run["event"] != "push" or run["path"] != WORKFLOW or
        run["repository"]["full_name"] != REPO or run["head_repository"]["full_name"] != REPO):
        raise ValueError("previous trusted origin mismatch")
    verified = build_reuse_plan(snapshot=captured, report=report, stage=base / "tree/release-site",
                                expected_origin=origin)
    if prior != verified:
        raise ValueError("previous plan not reproducible from exact audit and stage")
    return verified, base / "tree/release-site"


def compare_with_prior(snapshot, results, web, inspections=None):
    if snapshot is None:
        return
    loaded = load_verified_prior()
    if loaded is None:
        print(json.dumps({"event": "pdf-transform-shadow", "prior_available": False, "skipped": 0}), flush=True)
        return
    verified, _ = loaded
    print(json.dumps(compare_fresh_results(snapshot, verified, results, web, inspections)), flush=True)


def prepare_reuse(snapshot):
    """Only called from trusted workflow explicitly opted into experimental reuse."""
    if snapshot is None or os.environ.get("EVIDENCE_LAB_PDF_TRANSFORM_MODE") != "reuse":
        return None, {}
    trusted_origin()
    loaded = load_verified_prior()
    if loaded is None:
        return None, {}
    prior, stage = loaded
    return stage, {rel: {**row, "prior_origin": prior["origin"],
                        "prior_report_sha256": prior["report_sha256"]}
                   for rel, row in comparable_entries(snapshot, prior).items()}


def verified_candidate_bytes(path, row, stage):
    """Return exact previous output only when current input bytes still match."""
    from pdf_audit_ledger import file_sha, safe_path
    rel = row["rel"]
    if not safe_path(rel) or file_sha(path) != row["source_sha256"]:
        return None
    source = Path(stage) / rel
    mirror = Path(stage) / "web" / rel
    if source.is_symlink() or mirror.is_symlink() or source.stat().st_size > 256 * 1024 * 1024:
        return None
    if file_sha(source) != row["public_sha256"] or file_sha(mirror) != row["public_sha256"]:
        return None
    data = source.read_bytes()
    if (not data.startswith(b"%PDF-") or b"%%EOF" not in data[-4096:] or
        hashlib.sha256(data).hexdigest() != row["public_sha256"] or file_sha(path) != row["source_sha256"]):
        return None
    return data


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
