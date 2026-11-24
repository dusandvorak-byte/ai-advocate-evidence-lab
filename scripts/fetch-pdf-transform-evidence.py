"""Read-only retrieval of a previous successful, exact trusted audit plan.

GitHub is the authenticated origin. Only main push runs with a complete
successful audit and exact ZIP digests are accepted; no archive is executed.
An expired artifact simply means a cold cache.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

spec = importlib.util.spec_from_file_location("benchmark_fetch", Path(__file__).with_name("fetch-benchmark-release.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
from pdf_transform_runtime import trusted_origin, runner_path

HASH = re.compile(r"^sha256:[0-9a-f]{64}$")


def artifact(listing, name):
    rows = [r for r in listing.get("artifacts", []) if r.get("name") == name and r.get("expired") is False]
    if len(rows) != 1:
        return None
    row = rows[0]
    if not isinstance(row.get("digest"), str) or not HASH.fullmatch(row["digest"]):
        return None
    return row["id"], row["digest"][7:]


def fetch_previous(root):
    origin = trusted_origin()
    listing = helper.api("actions/workflows/trusted-pdf-shard-diagnostic.yml/runs?branch=main&event=push&status=success&per_page=20")
    for run in listing.get("workflow_runs", []):
        sha = run.get("head_sha", "")
        if (run.get("id") == origin["run_id"] or run.get("run_attempt") != 1 or
                not re.fullmatch(r"[0-9a-f]{40}", sha) or sha == origin["source_commit"]):
            continue
        if subprocess.run(["git", "merge-base", "--is-ancestor", sha, origin["source_commit"]],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            continue
        items = helper.api(f"actions/runs/{run['id']}/artifacts?per_page=100")
        ev = artifact(items, "pdf-transform-evidence-" + sha)
        tree = artifact(items, "trusted-public-tree-" + sha)
        report = artifact(items, "evidence-lab-pdf-shard-diagnostic-" + sha)
        if not (ev and tree and report):
            continue
        root.mkdir(mode=0o700)
        helper.fetch(root, "prior", run["id"], sha, {"tree": tree, "report": report})
        base = root / "prior"
        archive = base / "evidence.zip"
        with archive.open("xb") as out:
            subprocess.run(["gh", "api", f"repos/{helper.REPO}/actions/artifacts/{ev[0]}/zip"],
                           stdout=out, check=True, timeout=120)
        helper.require(helper.digest(archive) == ev[1], "Transformation evidence ZIP digest mismatch")
        helper.extract(archive, base / "evidence")
        archive.unlink()
        if {p.name for p in (base / "evidence").iterdir()} != {"snapshot.json", "plan.json"}:
            raise ValueError("unexpected transformation evidence files")
        snapshot = json.loads((base / "evidence/snapshot.json").read_bytes())
        expected = dict(repository=helper.REPO, workflow=helper.WORKFLOW, run_id=run["id"],
                        run_attempt=1, source_commit=sha)
        if snapshot["origin"] != expected:
            raise ValueError("snapshot run identity mismatch")
        for rel in (".source-commit", "web/.source-commit"):
            if (base / "tree/release-site" / rel).read_text().strip() != sha:
                raise ValueError("prior stage identity mismatch")
        print("Verified previous transform evidence, run", run["id"])
        return True
    print("No retained trusted transformation evidence: cold capture only")
    return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: fetch-pdf-transform-evidence.py RUNNER_TEMP_DEST")
    raise SystemExit(0 if fetch_previous(runner_path(sys.argv[1])) else 3)
