#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026.json"
REPORT = ROOT / "project-memory/privacy-hardening-report.json"
POLICY = ROOT / "scripts/publication_redaction.py"

DERIVATIVE_MARKERS = ("generated", "public_copy", "text_copy", "redacted", "not_byte_identical")
FILENAME_DERIVATIVE = re.compile(r"(?i)(verejna|veřejná|textova|textová|redigovan|public[-_ ]?copy)")

# Longest / most specific first so overlapping fragments are redacted only once.
RULES = [
    {
        "id": "private_email",
        "variants": ["DusanDvorak@seznam.cz", "dusandvorak@seznam.cz"],
        "replacement": "[soukromý e-mail redigován]",
    },
    {
        "id": "private_data_box",
        "variants": ["r8u3nhx", "R8U3NHX"],
        "replacement": "[ID datové schránky redigováno]",
    },
    {
        "id": "exact_birth_date",
        "variants": ["12. ledna 1962", "12. Ledna 1962", "12. 1. 1962", "12.1.1962"],
        "replacement": "1962",
    },
    {
        "id": "private_address_full",
        "variants": [
            "Ospělov č. p. 6, 798 55 Ludmírov",
            "Ospělov 6, 798 55 Ludmírov",
            "Ospělov 6, 798 55 Ospělov",
            "bytem Ospělov 6, 798 55 Ospělov",
            "798 55 Ospělov 6",
            "79855 Ospělov 6",
            "Ludmírov Ospělov 6, Hvozd u Prostějova, 79855",
        ],
        "replacement": "Ludmírov",
    },
    {
        "id": "private_address_house",
        "variants": ["Ospělov č. p. 6", "Ospělov 6"],
        "replacement": "Ludmírov",
    },
    {
        "id": "private_postcode_locality",
        "variants": ["798 55 Ospělov", "798 55 Ludmírov"],
        "replacement": "Ludmírov",
    },
    {
        "id": "private_postcode_unspaced",
        "variants": ["79855"],
        "replacement": "[soukromé PSČ redigováno]",
    },
]

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())

def derivative_doc(item: dict) -> bool:
    public = item.get("public") or {}
    rel = str(public.get("pdf") or "")
    status = " ".join([
        str(public.get("verification_status") or ""),
        str(public.get("public_copy_note") or ""),
        rel,
    ]).lower()
    return bool(rel) and (
        bool(FILENAME_DERIVATIVE.search(rel))
        or any(marker in status for marker in DERIVATIVE_MARKERS)
    )

def rect_overlaps(rect: fitz.Rect, used: list[fitz.Rect]) -> bool:
    # Treat meaningful intersection as already covered by a more specific rule.
    return any((rect & existing).get_area() > 0.15 * min(rect.get_area(), existing.get_area()) for existing in used)

def harden_pdf(path: Path) -> tuple[bytes | None, list[dict]]:
    doc = fitz.open(path)
    matches: list[dict] = []
    changed = False

    for page_number, page in enumerate(doc):
        used: list[fitz.Rect] = []
        for rule in RULES:
            for variant in sorted(rule["variants"], key=len, reverse=True):
                for rect in page.search_for(variant):
                    if rect_overlaps(rect, used):
                        continue
                    page.add_redact_annot(
                        rect,
                        text=rule["replacement"],
                        fontsize=6,
                        fontname="helv",
                        fill=(1, 1, 1),
                        text_color=(0, 0, 0),
                    )
                    used.append(rect)
                    matches.append({
                        "page": page_number + 1,
                        "rule": rule["id"],
                        "matched_variant": variant,
                        "replacement": rule["replacement"],
                    })
                    changed = True
        if used:
            page.apply_redactions()

    if not changed:
        doc.close()
        return None, []

    # Remove document metadata that can carry local usernames or author details.
    doc.set_metadata({})
    out = path.with_suffix(path.suffix + ".privacy.tmp")
    doc.save(out, garbage=4, clean=True, deflate=True)
    doc.close()

    data = out.read_bytes()
    out.unlink(missing_ok=True)
    return data, matches

def forbidden_hits(path: Path) -> list[str]:
    doc = fitz.open(path)
    text = "\n".join(page.get_text("text") for page in doc)
    doc.close()
    checks = [
        re.compile(r"(?i)\bDusanDvorak@seznam\.cz\b"),
        re.compile(r"(?i)\br8u3nhx\b"),
        re.compile(r"\b12\.\s*1\.\s*1962\b"),
        re.compile(r"(?i)\b12\.\s*ledna\s+1962\b"),
        re.compile(r"(?i)\bOspělov(?:\s+č\.\s*p\.)?\s*6\b"),
        re.compile(r"(?i)\b798\s*55\s*Ospělov\b"),
        re.compile(r"(?i)\b798\s*55\s*Ludmírov\b"),
        re.compile(r"(?i)\b79855\b"),
    ]
    return [pattern.pattern for pattern in checks if pattern.search(text)]

def main() -> None:
    registry = json.loads(REGISTRY.read_text("utf-8"))
    if not isinstance(registry.get("documents"), list):
        raise SystemExit("canonical document registry missing documents array")

    policy_sha = sha256_file(POLICY)
    rows = []
    failures = []

    for item in registry["documents"]:
        if not derivative_doc(item):
            continue
        public = item.get("public") or {}
        rel = public.get("pdf")
        path = WEB / rel
        if not path.exists():
            failures.append(f"missing derivative PDF: {item.get('id')} {rel}")
            continue

        before_sha = sha256_file(path)
        before_pages = fitz.open(path).page_count
        data, matches = harden_pdf(path)
        if data is not None:
            path.write_bytes(data)
        after_sha = sha256_file(path)
        after_doc = fitz.open(path)
        after_pages = after_doc.page_count
        after_doc.close()

        if before_pages != after_pages:
            failures.append(f"page-count changed during privacy hardening: {rel} {before_pages}->{after_pages}")

        hits = forbidden_hits(path)
        if hits:
            failures.append(f"known private identifier remains after privacy hardening: {rel}: {hits}")

        if matches:
            public["sha256"] = after_sha
            status = str(public.get("verification_status") or "published")
            if "publication_policy_hardened" not in status:
                public["verification_status"] = status + "; publication_policy_hardened"
            item["public"] = public

        rows.append({
            "id": item.get("id"),
            "public_path": rel,
            "input_sha256": before_sha,
            "output_sha256": after_sha,
            "page_count": after_pages,
            "changed": bool(matches),
            "redaction_matches": matches,
            "known_private_identifier_hits_after": hits,
        })

    report = {
        "schema_version": "1.0",
        "policy_file": POLICY.relative_to(ROOT).as_posix(),
        "policy_sha256": policy_sha,
        "derivative_count": len(rows),
        "changed_derivative_count": sum(1 for row in rows if row["changed"]),
        "hard_failure_count": len(failures),
        "hard_failures": failures,
        "documents": rows,
    }

    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps(report["hard_failures"], ensure_ascii=False))
    print(
        f"Privacy hardening: {report['derivative_count']} derivatives checked; "
        f"{report['changed_derivative_count']} changed; {report['hard_failure_count']} failures"
    )
    if failures:
        raise SystemExit("\n".join(failures))

if __name__ == "__main__":
    main()
