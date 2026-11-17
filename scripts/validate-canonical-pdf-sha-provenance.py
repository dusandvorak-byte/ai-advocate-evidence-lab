#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

from provenance_manifest import manifest_binds_digest

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "project-memory" / "documents-2026.json"
ALLOWED = {
    "binding-manifest-exact-digest-verified",
    "historical-introduction-and-blob-continuity-verified",
    "historical-origin-restoration-and-blob-continuity-verified",
    "deterministic-generated-public-copy-verified",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def git_show(commit: str, path: str) -> bytes:
    proc = subprocess.run(
        ["git", "show", f"{commit}:{path}"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    if proc.returncode != 0:
        raise RuntimeError(f"cannot read provenance bytes {commit}:{path}")
    return proc.stdout


registry = json.loads(REGISTRY.read_text("utf-8"))
checked = []
failures = []

for item in registry.get("documents", []):
    public = item.get("public") or {}
    rel = str(public.get("pdf") or "")
    provenance = str(public.get("sha256_provenance") or "")
    if not rel or not provenance:
        continue

    sha = str(public.get("sha256") or "").lower()
    status = str(public.get("sha256_provenance_status") or "")
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        failures.append(f"{item.get('id')}: invalid canonical SHA")
        continue
    if status not in ALLOWED:
        failures.append(f"{item.get('id')}: unsupported provenance status {status!r}")
        continue

    ok = False
    evidence = None
    if status == "binding-manifest-exact-digest-verified":
        manifest = public.get("source_manifest")
        ok = manifest_binds_digest(ROOT, manifest, item.get("id"), rel, sha)
        evidence = manifest

    elif status in {
        "historical-introduction-and-blob-continuity-verified",
        "historical-origin-restoration-and-blob-continuity-verified",
    }:
        m = re.search(r"\b[0-9a-f]{40}\b", provenance)
        if not m:
            failures.append(f"{item.get('id')}: introduction commit missing from provenance")
            continue
        commit = m.group(0)
        historical = git_show(commit, "web/" + rel)
        current_path = ROOT / "web" / rel
        if not current_path.is_file():
            failures.append(f"{item.get('id')}: current web PDF missing for historical provenance")
            continue
        historical_sha = sha256_bytes(historical)
        current_sha = sha256_file(current_path)
        ok = historical_sha == sha and current_sha == sha
        evidence = commit

    elif status == "deterministic-generated-public-copy-verified":
        current_path = ROOT / "web" / rel
        if not current_path.is_file():
            failures.append(f"{item.get('id')}: deterministic generated PDF missing after rebuild")
            continue
        current_sha = sha256_file(current_path)
        ok = current_sha == sha
        evidence = "current deterministic rebuild"

    if not ok:
        failures.append(f"{item.get('id')}: provenance verification failed ({status})")
    checked.append({
        "id": item.get("id"),
        "pdf": rel,
        "sha256": sha,
        "provenance_status": status,
        "evidence": evidence,
        "verified": ok,
    })

if failures:
    print(json.dumps({"checked": len(checked), "failures": failures}, ensure_ascii=False))
    raise SystemExit("canonical PDF provenance verification failed")

print(json.dumps({
    "checked": len(checked),
    "verified": sum(1 for row in checked if row["verified"]),
    "statuses": sorted({row["provenance_status"] for row in checked}),
}, ensure_ascii=False))
