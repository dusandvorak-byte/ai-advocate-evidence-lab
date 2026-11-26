"""Read-only, event-driven shadow of existing release preflight."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from completion_identity import REPO, select_completed_run
from completion_artifacts import select_artifacts, validate_report

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops/runtime-parity"))
from extract_pinned_baseline import extract


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", path]))


def current_main():
    return api(f"repos/{REPO}/git/ref/heads/main")["object"]["sha"]


def main():
    if (os.environ.get("GITHUB_ACTIONS") != "true" or
            os.environ.get("GITHUB_EVENT_NAME") != "workflow_run" or
            os.environ.get("GITHUB_REPOSITORY") != REPO or
            os.environ.get("GITHUB_REF") != "refs/heads/main"):
        raise ValueError("untrusted completion context")
    start = time.monotonic()
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    event_run = event["workflow_run"]
    run_id = event_run["id"]
    if type(run_id) is not int or run_id < 1:
        raise ValueError("invalid run ID")
    sha = current_main()
    if event_run["head_sha"] != sha:
        print("Shadow preflight skipped: completion superseded by newer main")
        return
    if subprocess.check_output(["git","rev-parse","HEAD"], cwd=ROOT, text=True).strip() != sha:
        raise ValueError("shadow checkout is not exact current main")
    base = f"repos/{REPO}/actions"
    actual = api(f"{base}/runs/{run_id}")
    runs = api(f"{base}/workflows/trusted-pdf-shard-diagnostic.yml/runs?branch=main&event=push&head_sha={sha}&per_page=100")
    if runs["total_count"] > 100 or not runs["workflow_runs"]:
        raise ValueError("ambiguous latest audit run")
    latest = max(runs["workflow_runs"], key=lambda r:(r["created_at"],r["id"]))
    select_completed_run(event_run, actual, latest, sha)
    listing = api(f"{base}/runs/{run_id}/artifacts?per_page=100")
    if listing["total_count"] > 100:
        raise ValueError("ambiguous artifact listing")
    names = {f"trusted-public-tree-{sha}",f"evidence-lab-pdf-shard-diagnostic-{sha}"}
    candidates = []
    for item in listing["artifacts"]:
        if item["name"] in names:
            detail = api(f"{base}/artifacts/{item['id']}")
            if detail["id"] != item["id"] or detail["name"] != item["name"]:
                raise ValueError("artifact list/detail mismatch")
            candidates.append(detail)
    selected = select_artifacts(candidates,run_id,sha)
    with tempfile.TemporaryDirectory(prefix="shadow-preflight-") as directory:
        root = Path(directory)
        for kind, info in selected.items():
            dest = root / (kind+".zip")
            with dest.open("wb") as stream:
                subprocess.run(["gh","api",f"{base}/artifacts/{info['id']}/zip"],stdout=stream,check=True)
            if dest.stat().st_size != info["size"]:
                raise ValueError("artifact ZIP size mismatch")
            target = root / kind
            target.mkdir()
            extract(dest,target,info["sha256"],report=(kind=="report"))
        report_path = root / "report/release-evidence-audit.json"
        validate_report(json.loads(report_path.read_text()),sha)
        stage = root / "tree/release-site"
        for rel in (".source-commit","web/.source-commit"):
            if (stage/rel).read_text().strip() != sha:
                raise ValueError("staged source marker mismatch")
        if not all((stage/rel).is_file() for rel in (".nojekyll","web/.nojekyll")):
            raise ValueError("missing nojekyll marker")
        env = dict(os.environ)
        env.pop("GH_TOKEN",None)
        env.pop("GITHUB_TOKEN",None)
        subprocess.run([sys.executable,str(ROOT/"scripts/validate-staged-legacy-pdf-provenance.py"),
                        str(report_path),str(stage)],check=True,env=env)
        subprocess.run(["node",str(ROOT/"scripts/release-cache-version.mjs"),"--verify",
                        str(stage),sha],check=True,env=env)
        if current_main() != sha:
            raise ValueError("main changed during shadow preflight")
        # Recheck the latest run and its attempt after all artifact work.
        actual = api(f"{base}/runs/{run_id}")
        runs = api(f"{base}/workflows/trusted-pdf-shard-diagnostic.yml/runs?branch=main&event=push&head_sha={sha}&per_page=100")
        if runs["total_count"] > 100 or not runs["workflow_runs"]:
            raise ValueError("ambiguous latest audit run")
        latest = max(runs["workflow_runs"],key=lambda r:(r["created_at"],r["id"]))
        select_completed_run(event_run,actual,latest,sha)
        print(json.dumps({"event":"shadow-preflight-completed","source_sha":sha,"audit_run_id":run_id,
                          "audit_run_attempt":actual["run_attempt"],"artifact_ids":selected,
                          "elapsed_ms":round((time.monotonic()-start)*1000),
                          "production_authoritative":False,"publication_authorization":False},sort_keys=True))


if __name__ == "__main__":
    main()
