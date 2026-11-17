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

def manifest_binds_digest(manifest, doc_id, rel, measured_sha):
    if not manifest or manifest == "filename-reference-date-reconciliation":
        return False
    path = ROOT / manifest
    if not path.is_file():
        return False
    try:
        text = path.read_text("utf-8")
    except UnicodeDecodeError:
        return False
    if measured_sha.lower() not in text.lower():
        return False
    return (str(doc_id or "") in text) or (rel in text) or (("web/" + rel) in text)

registry=json.loads(REGISTRY.read_text("utf-8"))
rows=[]
for item in registry.get("documents", []):
    public=item.get("public") or {}
    rel=str(public.get("pdf") or "")
    sha=str(public.get("sha256") or "")
    if not rel or re.fullmatch(r"[0-9a-fA-F]{64}", sha):
        continue

    source_path=ROOT/"web"/rel
    checked_in_data=source_path.read_bytes() if source_path.is_file() else None
    gh_data, gh_ref=git_show(rel)

    data=checked_in_data if checked_in_data is not None else gh_data
    measured_from="checked_in_web" if checked_in_data is not None else ("current_gh_pages" if gh_data is not None else None)
    source_ref=str(source_path.relative_to(ROOT)) if checked_in_data is not None else gh_ref

    checked_sha=digest(checked_in_data) if checked_in_data is not None else None
    gh_sha=digest(gh_data) if gh_data is not None else None
    manifest=public.get("source_manifest")
    measured_sha=digest(data) if data is not None else None
    digest_bound=bool(measured_sha and manifest_binds_digest(manifest, item.get("id"), rel, measured_sha))
    if digest_bound:
        provenance_strength="EXPLICIT_DIGEST_MANIFEST"
    elif manifest and manifest != "filename-reference-date-reconciliation":
        provenance_strength="EXPLICIT_PROJECT_MANIFEST_NO_DIGEST"
    elif manifest == "filename-reference-date-reconciliation":
        provenance_strength="HEURISTIC_RECONCILIATION_ONLY"
    else:
        provenance_strength="NO_EXPLICIT_MANIFEST"

    row={
        "id": item.get("id"),
        "pdf": rel,
        "verification_status": public.get("verification_status"),
        "source_manifest": manifest,
        "source_text": public.get("source_text"),
        "source_sha256": public.get("source_sha256") or public.get("source_original_sha256"),
        "provenance_strength": provenance_strength,
        "measured_from": measured_from,
        "source_ref": source_ref,
        "pdf_magic_ok": bool(data and data.startswith(b"%PDF-")),
        "byte_size": len(data) if data is not None else None,
        "measured_sha256": measured_sha,
        "manifest_digest_binding": digest_bound,
        "checked_in_sha256": checked_sha,
        "gh_pages_sha256": gh_sha,
        "continuity_match": bool(checked_sha and gh_sha and checked_sha == gh_sha),
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
