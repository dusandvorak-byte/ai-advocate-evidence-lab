"""Exact prior public-copy restoration; current policy checks remain mandatory.
Prior redaction geometry is evidence of the prior transformation, not a new
redaction. The caller MUST scan the restored bytes under current policy.
"""
import hashlib
import json
import os
from pathlib import Path

SOURCE = "fee5324f6145f27d3c1ece9526cca5e42f2902f9"
RUN = 45396121256
ROOT = Path(__file__).resolve().parents[1]
PINS = ROOT / "project-memory/late-original-public-pins-2026-11-24.json"


def require(condition, message):
    if not condition:
        raise RuntimeError("pinned late baseline: " + message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_pins():
    data = json.loads(PINS.read_text("utf-8"))
    rows = data["records"]
    require(data["source_checkout"] == SOURCE and data["current_trusted_artifact"] == 14921488296
            and len(rows) == 31 and len({r["path"] for r in rows}) == 31, "pin manifest identity")
    return {r["path"]: r for r in rows}


def restore_redacted_pin(rel, source_sha, pages, policy_sha, identity):
    baseline = os.environ.get("EVIDENCE_LAB_PINNED_LATE_BASELINE")
    if not baseline:
        return None
    pin = read_pins().get(rel)
    if not pin or pin["kind"] != "redact":
        return None
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_EVENT_NAME") == "push"
            and os.environ.get("GITHUB_REPOSITORY") == "dusandvorak-byte/ai-advocate-evidence-lab",
            "trusted environment required")
    require(source_sha == pin["source_sha256"] and pages == pin["pages"], "source identity mismatch")
    base = Path(baseline).resolve()
    require(base.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve()) and not base.is_relative_to(ROOT),
            "unsafe baseline location")
    run = json.loads((base / "run.json").read_text("utf-8"))
    require(run["id"] == RUN and run["head_sha"] == SOURCE and run["run_attempt"] == 1
            and run["head_branch"] == "main" and run["event"] == "push"
            and run["path"] == ".github/workflows/trusted-pdf-shard-diagnostic.yml"
            and run["status"] == "completed" and run["conclusion"] == "success"
            and run["repository"]["full_name"] == os.environ["GITHUB_REPOSITORY"]
            and run["head_repository"]["full_name"] == os.environ["GITHUB_REPOSITORY"], "prior run identity")
    report = json.loads((base / "report/release-evidence-audit.json").read_text("utf-8"))
    require(report["checkout_commit"] == SOURCE and report["github_event_sha"] == SOURCE
            and report["summary"]["hard_failure_count"] == 0 and report["summary"]["hard_failures"] == []
            and report["registry_web_stage_reconciliation"]["staged_set_exact_match"] is True
            and report["registry_web_stage_reconciliation"]["id69_absent_from_final_release_state"] is True,
            "prior audit not clean")
    hard = report["privacy_hardening"]
    require(hard["schema_version"] == "1.2" and hard["policy_sha256"] == policy_sha
            and hard["authenticated_private_policy_identity"] == identity
            and hard["hard_failure_count"] == 0 and hard["hard_failures"] == [], "policy or hardening report mismatch")
    rows = [r for r in hard["documents"] if r["id"] == pin["id"] and r["public_path"] == rel]
    require(len(rows) == 1, "missing or ambiguous transformation")
    row = rows[0]
    require(row["input_sha256"] == source_sha and row["output_sha256"] == pin["public_sha256"]
            and row["page_count"] == pages and row["changed"] is True and row["registered"] is True
            and row["strategy"] == "redact" and row["text_fallback"] is None
            and row["known_private_identifier_hits_after"] == [] and row["decoded_private_identifier_hits_after"] == []
            and isinstance(row["redaction_matches"], list) and bool(row["redaction_matches"])
            and all(isinstance(m["page"], int) and 1 <= m["page"] <= pages and isinstance(m["rule"], str) and bool(m["rule"]) for m in row["redaction_matches"]),
            "prior transformation mismatch")
    for path in (rel, "web/" + rel):
        audits = [r for r in report["all_final_web_pdfs"] if r["published_path"] == path]
        require(len(audits) == 1 and audits[0]["sha256"] == pin["public_sha256"]
                and audits[0]["page_count"] == pages and audits[0]["checks"]
                and all(v is True for v in audits[0]["checks"].values()), "prior staged PDF audit mismatch")
    tree = base / "tree/release-site"
    data = (tree / rel).read_bytes()
    mirror = (tree / "web" / rel).read_bytes()
    git_blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    require(data == mirror and len(data) == pin["public_size"] and data.startswith(b"%PDF-")
            and b"%%EOF" in data[-4096:] and sha(data) == pin["public_sha256"]
            and git_blob == pin["public_git_blob"], "prior public bytes mismatch")
    return data, row["redaction_matches"], {"run_id": RUN, "source_commit": SOURCE, "public_sha256": pin["public_sha256"]}
