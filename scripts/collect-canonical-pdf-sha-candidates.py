#!/usr/bin/env python3
import hashlib, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "project-memory" / "documents-2026.json"
OUT = ROOT / "review-artifacts" / "canonical-pdf-sha-candidates.json"

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def git_show(path: str):
    for candidate in (path, "web/" + path):
        proc = subprocess.run(
            ["git", "show", f"origin/gh-pages:{candidate}"],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
        if proc.returncode == 0:
            return proc.stdout, candidate
    return None, None

registry=json.loads(REGISTRY.read_text("utf-8"))
rows=[]
for item in registry.get("documents", []):
    public=item.get("public") or {}
    rel=str(public.get("pdf") or "")
    sha=str(public.get("sha256") or "")
    if not rel or re.fullmatch(r"[0-9a-fA-F]{64}", sha):
        continue

    source_path=ROOT/"web"/rel
    data=None
    measured_from=None
    source_ref=None
    if source_path.is_file():
        data=source_path.read_bytes()
        measured_from="checked_in_web"
        source_ref=str(source_path.relative_to(ROOT))
    else:
        data, source_ref=git_show(rel)
        if data is not None:
            measured_from="current_gh_pages"

    row={
        "id": item.get("id"),
        "pdf": rel,
        "verification_status": public.get("verification_status"),
        "source_manifest": public.get("source_manifest"),
        "measured_from": measured_from,
        "source_ref": source_ref,
        "pdf_magic_ok": bool(data and data.startswith(b"%PDF-")),
        "byte_size": len(data) if data is not None else None,
        "measured_sha256": digest(data) if data is not None else None,
        "canonical_sha_present": False,
        "promotion_status": "MEASUREMENT_ONLY_NOT_AUTHORITY",
    }
    rows.append(row)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "schema_version":"1.0",
    "purpose":"Non-sensitive SHA candidate measurements for canonical PDF provenance review.",
    "count":len(rows),
    "items":rows,
},ensure_ascii=False,indent=2)+"\n","utf-8")
print(json.dumps({
    "candidate_count":len(rows),
    "checked_in":sum(r["measured_from"]=="checked_in_web" for r in rows),
    "gh_pages":sum(r["measured_from"]=="current_gh_pages" for r in rows),
    "missing_bytes":sum(r["measured_from"] is None for r in rows)
}))
