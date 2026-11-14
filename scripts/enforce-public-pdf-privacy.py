#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = WEB / "data" / "documents-2026.json"
MANIFEST = WEB / "data" / "public-pdf-privacy-enforcement.json"

# Longest/specific phrases first. Replacements deliberately contain ASCII only so
# PyMuPDF can render them with a built-in font in every CI environment.
REDACTIONS = [
    ("Ospělov č. p. 6, 798 55 Ludmírov", "Ludmirov", "private_address"),
    ("Ospělov 6, 798 55 Ludmírov", "Ludmirov", "private_address"),
    ("Ospělov 6, 798 55 Ospělov", "Ludmirov", "private_address"),
    ("798 55 Ospělov 6", "Ludmirov", "private_address"),
    ("79855 Ospělov 6", "Ludmirov", "private_address"),
    ("12. ledna 1962", "1962", "exact_birth_date"),
    ("12. 1. 1962", "1962", "exact_birth_date"),
    ("DusanDvorak@seznam.cz", "[redacted]", "private_email"),
    ("r8u3nhx", "[redacted]", "private_data_box"),
    ("Ospělov č. p. 6", "Ludmirov", "private_address"),
    ("Ospělov 6", "Ludmirov", "private_address"),
    ("798 55 Ospělov", "Ludmirov", "private_address"),
    ("798 55 Ludmírov", "Ludmirov", "private_address"),
    ("79855", "[redacted]", "private_postcode"),
]

FORBIDDEN = [needle for needle, _, _ in REDACTIONS]

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def derivative(item: dict) -> bool:
    public = item.get("public") or {}
    rel = str(public.get("pdf") or "")
    if not rel.lower().endswith(".pdf"):
        return False
    status = " ".join([
        str(public.get("verification_status") or ""),
        str(public.get("public_copy_note") or ""),
        rel,
    ]).lower()
    markers = (
        "generated", "public_copy", "public-copy", "text_copy", "text-copy",
        "redacted", "redigovan", "verejna", "veřejná", "not_byte_identical",
    )
    # Byte-identical originals are source evidence and must never be altered here.
    if "source_pdf_received_binary_original" in status or "byte_identical_original" in status:
        return False
    return any(marker in status for marker in markers)

def overlaps(a: fitz.Rect, b: fitz.Rect) -> bool:
    inter = a & b
    return not inter.is_empty and inter.get_area() > 0.1

def redact_pdf(path: Path) -> tuple[str, str, list[dict]]:
    before = sha256(path)
    doc = fitz.open(path)
    changes: list[dict] = []

    for page_index, page in enumerate(doc):
        candidates = []
        for needle, replacement, kind in REDACTIONS:
            for rect in page.search_for(needle):
                candidates.append((len(needle), needle, replacement, kind, rect))
        candidates.sort(key=lambda item: item[0], reverse=True)

        selected = []
        for _, needle, replacement, kind, rect in candidates:
            if any(overlaps(rect, chosen[-1]) for chosen in selected):
                continue
            selected.append((needle, replacement, kind, rect))

        for needle, replacement, kind, rect in selected:
            page.add_redact_annot(
                rect,
                text=replacement,
                fontname="helv",
                fontsize=7,
                fill=(1, 1, 1),
                text_color=(0, 0, 0),
                align=fitz.TEXT_ALIGN_LEFT,
                cross_out=False,
            )
            changes.append({
                "page": page_index + 1,
                "kind": kind,
                "matched": needle,
                "replacement": replacement,
            })
        if selected:
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    if not changes:
        doc.close()
        return before, before, []

    fd, tmp_name = tempfile.mkstemp(prefix=path.stem + "-", suffix=".pdf", dir=path.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        # Keep document semantics/layout; remove stale object remnants and compress.
        doc.save(tmp, garbage=4, deflate=True, clean=True)
        doc.close()
        raw = tmp.read_bytes()
        if not raw.startswith(b"%PDF-") or b"%%EOF" not in raw[-4096:]:
            raise SystemExit(f"privacy-enforced PDF is invalid: {path}")
        os.replace(tmp, path)
    finally:
        if not doc.is_closed:
            doc.close()
        if tmp.exists():
            tmp.unlink()

    after_doc = fitz.open(path)
    final_text = "\n".join(page.get_text("text") for page in after_doc)
    after_doc.close()
    remaining = [needle for needle in FORBIDDEN if needle.lower() in final_text.lower()]
    if remaining:
        raise SystemExit(f"privacy enforcement incomplete for {path}: {remaining}")

    return before, sha256(path), changes

def main():
    data = json.loads(REGISTRY.read_text("utf-8"))
    records = []
    changed_docs = 0

    for item in data.get("documents", []):
        if not derivative(item):
            continue
        public = item.get("public") or {}
        rel = public.get("pdf")
        path = WEB / rel
        if not path.exists():
            continue

        before, after, changes = redact_pdf(path)
        if not changes:
            continue

        changed_docs += 1
        old_registry_sha = public.get("sha256")
        public["sha256"] = after
        public["privacy_enforcement_manifest"] = "data/public-pdf-privacy-enforcement.json"
        status = str(public.get("verification_status") or "published")
        if "binding_privacy_enforced" not in status:
            public["verification_status"] = status + "; binding_privacy_enforced"
        item["public"] = public

        slalom = item.get("justice_slalom")
        if isinstance(slalom, dict) and slalom.get("public_sha256") in (old_registry_sha, before, None):
            if slalom.get("public_pdf") == rel or slalom.get("pdf") == rel or slalom.get("public_sha256"):
                slalom["public_sha256"] = after

        records.append({
            "id": item.get("id"),
            "path": rel,
            "before_sha256": before,
            "after_sha256": after,
            "registry_sha_before": old_registry_sha,
            "redaction_count": len(changes),
            "redactions": changes,
        })

    REGISTRY.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "schema_version": "1.0",
        "policy": "project-memory/publication-axioms.json#criminal-submission-redacted-original-policy",
        "scope": "final public PDF derivatives only; byte-identical source originals excluded",
        "changed_document_count": changed_docs,
        "records": records,
    }, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"PUBLIC PDF PRIVACY ENFORCEMENT {changed_docs} changed derivatives; manifest={MANIFEST.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
