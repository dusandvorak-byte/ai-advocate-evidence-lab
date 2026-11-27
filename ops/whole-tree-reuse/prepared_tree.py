"""Conservative prepared-tree reuse. Never authorizes publication or skips final audit."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from pdf_transform_runtime import trusted_origin
from publication_redaction import verified_private_policy_identity
from pdf_transform_snapshot import audit_index

spec = importlib.util.spec_from_file_location("benchmark_fetch", ROOT / "scripts/fetch-benchmark-release.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

# Explicitly non-build input. No blanket docs/ops exclusion.
HEARTBEAT = "ops/whole-tree-reuse/refresh-request.json"
HIDDEN_SOURCE = "documents/2026-11-04/.gitattributes"
STAGE_MARKERS = {".source-commit", "web/.source-commit", ".nojekyll", "web/.nojekyll"}
HEX = re.compile(r"[0-9a-f]{64}")
SHA = re.compile(r"[0-9a-f]{40}")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def file_sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args], timeout=30)


def build_input_sha(tree):
    records = []
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        meta, name = entry.split(b"\t", 1)
        if name == HEARTBEAT.encode():
            require(meta.startswith(b"100644 blob "), "invalid refresh request file type")
            continue
        records.append(entry)
    return digest(b"\0".join(records) + b"\0")


def days(now=None):
    now = now or datetime.now(timezone.utc)
    return [now.astimezone(timezone.utc).date().isoformat(),
            now.astimezone(ZoneInfo("Europe/Prague")).date().isoformat()]


def inputs(origin):
    require(origin["run_attempt"] == 1 and git("rev-parse", "HEAD").decode().strip() == origin["source_commit"],
            "not exact first-attempt checkout")
    require(not git("status", "--porcelain", "--untracked-files=no"), "tracked checkout is not clean")
    engine = os.environ.get("EVIDENCE_LAB_RUNTIME_ENGINE_SHA256", "")
    image = os.environ.get("EVIDENCE_LAB_PDF_RUNTIME_IMAGE", "")
    require(os.environ.get("EVIDENCE_LAB_PDF_RUNTIME_MATERIALIZE") == "1"
            and HEX.fullmatch(engine) and re.fullmatch(
                r"ghcr\.io/dusandvorak-byte/ai-advocate-evidence-lab/pdf-runtime@sha256:[0-9a-f]{64}", image),
            "immutable runtime identity unavailable")
    require(os.environ.get("ImageOS") and os.environ.get("ImageVersion"), "unknown host runner")
    policy_sha = file_sha(ROOT / "scripts/publication_redaction.py")
    identity = verified_private_policy_identity()
    require(HEX.fullmatch(identity), "unauthenticated policy")
    # These are deterministic inputs; time stamps in reused output continue
    # to describe the actual earlier generation, not a fictional new build.
    facts = {
        "source_tree": build_input_sha(git("ls-tree", "-r", "-z", "HEAD")),
        "dates": days(), "engine": engine, "image": image,
        "policy_sha": policy_sha, "policy_identity": identity,
        "host_image": [os.environ["ImageOS"], os.environ["ImageVersion"]],
        "node": subprocess.check_output(["node", "--version"], timeout=10).decode().strip(),
        "python": sys.version,
        "host_packages": digest(subprocess.check_output(
            ["dpkg-query", "-W", "-f=${Package}\\t${Version}\\n"], timeout=30)),
        "pins_enforced": os.environ.get("EVIDENCE_LAB_ENFORCE_LATE_PINS") == "1",
        "pinned_baseline_available": bool(os.environ.get("EVIDENCE_LAB_PINNED_LATE_BASELINE")),
    }
    return facts


def inventory(root, *, stage=False, archived=False):
    require(root.is_dir() and not root.is_symlink(), "invalid inventory root")
    rows = {}
    for p in root.rglob("*"):
        rel = p.relative_to(root).as_posix()
        require(not p.is_symlink() and (p.is_dir() or p.is_file()), "nonregular tree entry")
        if p.is_dir():
            continue
        hidden = any(part.startswith(".") for part in Path(rel).parts)
        if hidden and not (stage and rel in STAGE_MARKERS):
            require(not archived and (rel == HIDDEN_SOURCE or
                    (stage and rel == "web/" + HIDDEN_SOURCE)), "unexpected hidden tree file")
            continue
        rows[rel] = file_sha(p)
    require(rows, "empty tree")
    return rows


def output_evidence(root, *, archived=False):
    web = inventory(root / "web", archived=archived)
    stage = inventory(root / "release-site", stage=True, archived=archived)
    memory = root / "project-memory"
    registry = file_sha(memory / "documents-2026.json")
    report = file_sha(memory / "privacy-hardening-report.json")
    require(stage.get("data/documents-2026.json") == registry
            and stage.get("web/data/documents-2026.json") == registry, "stage registry mismatch")
    return {"web_sha": digest(canonical(web)), "stage_sha": digest(canonical(stage)),
            "registry_sha": registry, "hardening_sha": report}


def matching_stamp(stamp, origin, facts):
    return (stamp.get("schema") == 1 and stamp.get("scope") == "full-materialization-inputs"
            and stamp.get("mode") == "full" and stamp.get("origin") == origin
            and stamp.get("inputs") == facts and facts.get("dates") == days()
            and isinstance(stamp.get("outputs"), dict)
            and set(stamp["outputs"]) == {"web_sha", "stage_sha", "registry_sha", "hardening_sha"}
            and all(isinstance(v, str) and HEX.fullmatch(v) for v in stamp["outputs"].values()))


def artifact(listing, name):
    rows = [r for r in listing.get("artifacts", []) if r.get("name") == name and r.get("expired") is False]
    if len(rows) != 1:
        return None
    row = rows[0]
    value = row.get("digest", "")
    if (type(row.get("id")) is not int or row["id"] < 1 or
            not isinstance(value, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", value)):
        return None
    return row["id"], value[7:]


def download_stamp(root, item):
    archive = root / "stamp.zip"
    with archive.open("xb") as out:
        subprocess.run(["gh", "api", f"repos/{helper.REPO}/actions/artifacts/{item[0]}/zip"],
                       stdout=out, check=True, timeout=60)
    require(archive.stat().st_size <= 65536 and file_sha(archive) == item[1], "stamp ZIP mismatch")
    with zipfile.ZipFile(archive) as z:
        rows = z.infolist()
        require(len(rows) == 1 and rows[0].filename == "stamp.json" and
                rows[0].file_size <= 65536 and not rows[0].is_dir(), "unexpected stamp archive")
        return json.loads(z.read(rows[0]))


def verify_prior(root, stamp, origin, facts):
    require(matching_stamp(stamp, origin, facts), "prepared input identity mismatch")
    require(output_evidence(root / "tree", archived=True) == stamp["outputs"], "prepared output digest mismatch")
    report = json.loads((root / "report/release-evidence-audit.json").read_text())
    stage = root / "tree/release-site"
    hardening = json.loads((root / "tree/project-memory/privacy-hardening-report.json").read_text())
    require(report.get("privacy_hardening") == hardening, "hardening evidence mismatch")
    final, _ = audit_index(report, origin["source_commit"], facts["policy_sha"], facts["policy_identity"])
    require(final, "empty audited PDF inventory")
    for rel, row in final.items():
        require(file_sha(stage / rel) == row["sha256"], "audited PDF digest mismatch")
    for rel in (".source-commit", "web/.source-commit"):
        require((stage / rel).read_text().strip() == origin["source_commit"], "prior source marker mismatch")


def find_prior(root, current, facts):
    runs = helper.api("actions/workflows/trusted-pdf-shard-diagnostic.yml/runs?branch=main&event=push&status=success&per_page=20")
    for run in runs.get("workflow_runs", []):
        sha = run.get("head_sha", "")
        if (run.get("id") == current["run_id"] or run.get("run_attempt") != 1 or
                not SHA.fullmatch(sha) or sha == current["source_commit"]):
            continue
        if subprocess.run(["git", "-C", str(ROOT), "merge-base", "--is-ancestor", sha, current["source_commit"]],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            continue
        listing = helper.api(f"actions/runs/{run['id']}/artifacts?per_page=100")
        if listing.get("total_count", 0) > 100:
            continue
        stamp_item = artifact(listing, "whole-tree-inputs-" + sha)
        tree = artifact(listing, "trusted-public-tree-" + sha)
        report = artifact(listing, "evidence-lab-pdf-shard-diagnostic-" + sha)
        if not (stamp_item and tree and report):
            continue
        origin = dict(repository=helper.REPO, workflow=helper.WORKFLOW, run_id=run["id"],
                      run_attempt=1, source_commit=sha)
        with tempfile.TemporaryDirectory(dir=root) as tmp:
            stamp = download_stamp(Path(tmp), stamp_item)
        if not matching_stamp(stamp, origin, facts):
            continue
        helper.fetch(root, "prior", run["id"], sha, {"tree": tree, "report": report})
        prior = root / "prior"
        verify_prior(prior, stamp, origin, facts)
        actual = helper.api(f"actions/runs/{run['id']}")
        require(actual.get("id") == run["id"] and actual.get("head_sha") == sha and
                actual.get("run_attempt") == 1 and actual.get("status") == "completed" and
                actual.get("conclusion") == "success", "prior run changed during retrieval")
        return prior / "tree", origin
    return None


def restore(tree):
    # All archive checks finish before changing the checkout. Once restoration
    # begins any failure is fatal; do not silently fall back on a mixed tree.
    with tempfile.TemporaryDirectory(prefix="verified-tree-", dir=ROOT.parent) as tmp:
        temp = Path(tmp)
        replacement = temp / "web"
        shutil.copytree(tree / "web", replacement)
        source = ROOT / "web" / HIDDEN_SOURCE
        if source.is_file() and not source.is_symlink():
            target = replacement / HIDDEN_SOURCE
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        require(inventory(replacement) == inventory(tree / "web", archived=True), "restore bytes mismatch")
        os.replace(ROOT / "web", temp / "old-web")
        os.replace(replacement, ROOT / "web")
        for rel in ("documents-2026.json", "privacy-hardening-report.json"):
            shutil.copyfile(tree / "project-memory" / rel, ROOT / "project-memory" / rel)


def prepare(root):
    root.mkdir(mode=0o700)
    try:
        origin = trusted_origin()
        facts = inputs(origin)
        (root / "pending.json").write_bytes(canonical({"origin": origin, "inputs": facts}))
        prior = find_prior(root, origin, facts)
        if not prior:
            print("Whole-tree reuse miss: no compatible first-attempt audited full build.")
            return "full"
        if facts["dates"] != days():
            return "full"
    except Exception as exc:
        # Never log sensitive paths, policy literals, archive text or tokens.
        print("Whole-tree reuse unavailable; canonical materialization:", type(exc).__name__)
        return "full"
    tree, prior_origin = prior
    restore(tree)
    print(json.dumps({"event": "trusted-prepared-tree-reused", "prior_run_id": prior_origin["run_id"],
                      "prior_source": prior_origin["source_commit"], "fresh_final_audit_required": True}))
    return "reuse"


def seal(root):
    pending = json.loads((root / "pending.json").read_text())
    require(pending["origin"] == trusted_origin() and pending["inputs"]["dates"] == days(),
            "materialization crossed date boundary or changed run")
    stamp = {"schema": 1, "scope": "full-materialization-inputs", "mode": "full",
             **pending, "outputs": output_evidence(ROOT)}
    (root / "stamp.json").write_bytes(canonical(stamp))


if __name__ == "__main__":
    require(len(sys.argv) == 3 and sys.argv[1] in ("prepare", "seal", "check-date"), "usage: prepare|seal|check-date RUNNER_TEMP_DIR")
    root = Path(sys.argv[2]).resolve()
    require(root.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve()) and not root.is_relative_to(ROOT),
            "unsafe cache destination")
    if sys.argv[1] == "prepare":
        mode = prepare(root)
        with open(os.environ["GITHUB_OUTPUT"], "a") as out:
            out.write("mode=" + mode + "\n")
    elif sys.argv[1] == "seal":
        seal(root)
    else:
        pending = json.loads((root / "pending.json").read_text())
        require(pending["origin"] == trusted_origin() and pending["inputs"]["dates"] == days(),
                "reused prepared tree crossed date boundary")
