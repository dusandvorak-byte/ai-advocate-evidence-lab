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
import tempfile
import zipfile

spec = importlib.util.spec_from_file_location("benchmark_fetch", Path(__file__).with_name("fetch-benchmark-release.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
from pdf_transform_runtime import trusted_origin, runner_path
from pdf_audit_engine_fingerprint import engine_fingerprint

HASH = re.compile(r"^sha256:[0-9a-f]{64}$")


def artifact(listing, name):
    rows = [r for r in listing.get("artifacts", []) if r.get("name") == name and r.get("expired") is False]
    if len(rows) != 1:
        return None
    row = rows[0]
    if not isinstance(row.get("digest"), str) or not HASH.fullmatch(row["digest"]):
        return None
    return row["id"], row["digest"][7:]


def inspect_evidence(archive, expected, engine):
    """A small, authenticated archive is only a rejection filter, not authority."""
    with zipfile.ZipFile(archive) as z:
        members = z.infolist()
        if (len(members) != 2 or {m.filename for m in members} != {"snapshot.json", "plan.json"}
                or sum(m.file_size for m in members) > 16 * 1024**2):
            raise ValueError("unexpected transformation evidence archive")
        snapshot = json.loads(z.read("snapshot.json"))
        plan = json.loads(z.read("plan.json"))
    if (snapshot.get("origin") != expected or plan.get("origin") != expected
            or snapshot.get("schema") != 1 or plan.get("schema") != 1
            or snapshot.get("scope") != "shadow-transform-inputs"
            or plan.get("scope") != "advisory-transform-reuse-plan"
            or plan.get("authorization_granted") is not False
            or plan.get("skip_scan_granted") is not False):
        raise ValueError("snapshot or plan identity mismatch")
    if snapshot.get("engine_sha256") != plan.get("engine_sha256"):
        raise ValueError("snapshot and plan engine mismatch")
    return snapshot.get("engine_sha256") == engine


def fetch_previous(root):
    origin = trusted_origin()
    # In the isolated hardening pilot, the trusted workflow measured this
    # fingerprint in the exact pulled image on this runner. This value is
    # only a download rejection filter; hardening recomputes its own engine
    # identity and independently rebuilds and checks the prior reuse plan.
    engine = os.environ.get("EVIDENCE_LAB_RUNTIME_ENGINE_SHA256")
    if engine is not None:
        if not re.fullmatch(r"[0-9a-f]{64}", engine) or os.environ.get("EVIDENCE_LAB_PDF_RUNTIME_MATERIALIZE") != "1":
            raise ValueError("invalid isolated runtime prefilter identity")
    else:
        engine = engine_fingerprint()
    listing = helper.api("actions/workflows/trusted-pdf-shard-diagnostic.yml/runs?branch=main&event=push&status=success&per_page=20")
    incompatible = 0
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
        expected = dict(repository=helper.REPO, workflow=helper.WORKFLOW, run_id=run["id"],
                        run_attempt=1, source_commit=sha)
        with tempfile.TemporaryDirectory(prefix="transform-filter-", dir=root.parent) as tmp:
            archive = Path(tmp) / "evidence.zip"
            with archive.open("xb") as out:
                subprocess.run(["gh", "api", f"repos/{helper.REPO}/actions/artifacts/{ev[0]}/zip"],
                               stdout=out, check=True, timeout=120)
            helper.require(archive.stat().st_size <= 16 * 1024**2 and
                           helper.digest(archive) == ev[1], "Transformation evidence ZIP digest or size mismatch")
            if not inspect_evidence(archive, expected, engine):
                incompatible += 1
                continue
            root.mkdir(mode=0o700)
            # Original independent run/API identity, artifact digest and extraction
            # checks are unchanged. Runtime still reproduces the complete plan.
            helper.fetch(root, "prior", run["id"], sha, {"tree": tree, "report": report})
            base = root / "prior"
            helper.extract(archive, base / "evidence")
            if {p.name for p in (base / "evidence").iterdir()} != {"snapshot.json", "plan.json"}:
                raise ValueError("unexpected transformation evidence files")
            for rel in (".source-commit", "web/.source-commit"):
                if (base / "tree/release-site" / rel).read_text().strip() != sha:
                    raise ValueError("prior stage identity mismatch")
            print("Verified previous transform evidence, run", run["id"],
                  "; incompatible engines skipped:", incompatible)
            return True
    print("No compatible retained trusted transformation evidence: cold capture only;",
          "incompatible engines skipped:", incompatible)
    return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: fetch-pdf-transform-evidence.py RUNNER_TEMP_DEST")
    raise SystemExit(0 if fetch_previous(runner_path(sys.argv[1])) else 3)
