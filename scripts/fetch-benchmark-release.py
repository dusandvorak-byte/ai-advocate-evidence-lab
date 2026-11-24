"""Read-only, pinned GitHub artifact acquisition for benchmark #315.
No files or reports uploaded; no archive content executed.
"""
import hashlib
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import zipfile

REPO = "dusandvorak-byte/ai-advocate-evidence-lab"
WORKFLOW = ".github/workflows/trusted-pdf-shard-diagnostic.yml"
PINS = {
    "old": (45416743059, "4ad97ed3e52c71044975dea612a99b20d04da378", {
        "tree": (14933324943, "ee3a361549bf77fbd0b2d8d917b077f90fa44f613c63b4c15b3704bd4cf3539b"),
        "report": (14934816461, "216a8f062ebcbc3cd75287079228fe7d59f51648ab1e57e722c0218c067aa54b"),
    }),
    "new": (45434990153, "264d9177d8e5a2289a93d1a83a4510d23dfd5c2f", {
        "tree": (14942163065, "c7499abe4dc235af9aeface1ce40d67f5b78e74059a17cadb2f0e52fbed7a8e4"),
        "report": (14941984399, "bcd96d85310056e420064d05af859579c77bb3b691d903a6ce23343ce1c0ec2b"),
    }),
}


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def api(suffix):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{suffix}"]))


def digest(file):
    with file.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def extract(archive, dest):
    dest.mkdir()
    with zipfile.ZipFile(archive) as z:
        members = z.infolist()
        require(len(members) <= 30000 and sum(m.file_size for m in members) <= 3 * 1024**3,
                "Archive limits exceeded")
        seen = set()
        for member in members:
            name = member.filename.rstrip("/")
            parts = name.split("/")
            require(name and "\\" not in name and all(p not in ("", ".", "..", ".git") for p in parts)
                    and all(not any(ord(c) < 32 for c in p) for p in parts)
                    and name not in seen, "Unsafe or duplicate archive member")
            seen.add(name)
            mode = stat.S_IFMT(member.external_attr >> 16)
            require(mode in (0, stat.S_IFREG, stat.S_IFDIR), "Nonregular archive member")
            target = dest.joinpath(*parts)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(member) as source, target.open("xb") as out:
                    shutil.copyfileobj(source, out)


def fetch(root, label, run_id, source, artifacts):
    run = api(f"actions/runs/{run_id}")
    require(run.get("id") == run_id and run.get("run_attempt") == 1
            and run.get("head_sha") == source and run.get("head_branch") == "main"
            and run.get("path") == WORKFLOW and run.get("event") == "push"
            and run.get("status") == "completed" and run.get("conclusion") == "success"
            and (run.get("repository") or {}).get("full_name") == REPO
            and (run.get("head_repository") or {}).get("full_name") == REPO,
            "Unexpected trusted run metadata")
    dest = root / label
    dest.mkdir()
    (dest / "run.json").write_text(json.dumps(run), encoding="utf-8")
    listing = api(f"actions/runs/{run_id}/artifacts?per_page=100")
    for kind, (artifact_id, expected) in artifacts.items():
        name = ("trusted-public-tree-" if kind == "tree" else "evidence-lab-pdf-shard-diagnostic-") + source
        rows = [a for a in listing.get("artifacts", []) if a.get("id") == artifact_id]
        require(len(rows) == 1 and rows[0].get("name") == name and rows[0].get("expired") is False
                and rows[0].get("digest") == "sha256:" + expected, "Pinned artifact unavailable or changed")
        archive = dest / (kind + ".zip")
        with archive.open("xb") as out:
            subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact_id}/zip"],
                           stdout=out, check=True)
        require(digest(archive) == expected, "Artifact ZIP digest mismatch")
        extract(archive, dest / kind)
        archive.unlink()
    print(f"Verified pinned audit artifacts: {label}, run {run_id}")


if __name__ == "__main__":
    require(len(sys.argv) == 2 and os.environ.get("GITHUB_REPOSITORY") == REPO,
            "Expected exact repository and isolated destination")
    root = pathlib.Path(sys.argv[1]).resolve()
    require(root.is_dir() and not any(root.iterdir()), "Benchmark root must be empty")
    for label, pins in PINS.items():
        fetch(root, label, *pins)
