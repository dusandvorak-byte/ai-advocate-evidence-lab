"""Fresh read-only final-stage audit parity; trusted diagnostic only.

Caller authenticates the exact checkout, baseline audit/report and prepared
tree using existing trusted artifact checks. Mount checkout/stage read-only,
pass the authenticated production policy only in a trusted main push job,
and never publish anything from this command.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
from compare_stage import compare, compare_section, validate_baseline

REPO = "dusandvorak-byte/ai-advocate-evidence-lab"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    if not (os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("GITHUB_EVENT_NAME") == "push"
            and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_REPOSITORY") == REPO):
        raise SystemExit("production-policy parity requires trusted main push")
    checkout = args.checkout.resolve(strict=True)
    stage = checkout / "release-site"
    for marker in (stage / ".source-commit", stage / "web/.source-commit"):
        if marker.read_text().strip() != args.source_sha:
            raise SystemExit("staged source marker mismatch")
    baseline = json.loads(args.baseline.read_text())
    validate_baseline(baseline, args.source_sha)
    os.environ["EVIDENCE_LAB_PUBLICATION_ROOT"] = str(stage)
    os.environ["EVIDENCE_LAB_CANONICAL_REGISTRY"] = str(checkout / "project-memory/documents-2026.json")
    os.environ["EVIDENCE_LAB_PDF_SHARD_WORKERS"] = "1"
    os.environ.pop("EVIDENCE_LAB_PDF_LEDGER_MODE", None)
    sys.path.insert(0, str(checkout / "scripts"))
    spec = importlib.util.spec_from_file_location("stage_audit", checkout / "scripts/audit-release-evidence-sliced.py")
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    # Capture ordinary audit fragments in memory; no writes to checkout.
    fragments = {}
    def capture(name, data, failures):
        key = "pdf-shard" if name == "pdf-shard-0-of-1" else name
        if key in fragments:
            raise ValueError("duplicate audit fragment")
        fragments[key] = {"checkout_commit": args.source_sha, "data": data, "failures": list(failures)}
    audit.write_fragment = capture
    started = time.monotonic()
    # Check the previously failing small generated section before the
    # expensive full PDF scan. No failed section can be accepted.
    audit.cmd_generated()
    compare_section(baseline, fragments["generated"], "generated", args.source_sha)
    audit.cmd_registry()
    compare_section(baseline, fragments["registry-derivatives"], "registry-derivatives", args.source_sha)
    audit.cmd_pdf_shard(0, 1)
    result = compare(baseline, fragments, args.source_sha)
    result["elapsed_ms"] = round((time.monotonic() - started)*1000)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
