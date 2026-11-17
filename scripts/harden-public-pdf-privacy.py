#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import fitz

from publication_redaction import (
    authenticated_private_policy_document,
    forbidden_public_identifiers,
)

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026.json"
REPORT = ROOT / "project-memory/privacy-hardening-report.json"
POLICY = ROOT / "scripts/publication_redaction.py"

DERIVATIVE_MARKERS = ("generated", "public_copy", "text_copy", "redacted", "not_byte_identical")
FILENAME_DERIVATIVE = re.compile(r"(?i)(verejna|veřejná|textova|textová|redigovan|public[-_ ]?copy)")

def private_pdf_rules() -> tuple[list[dict], str]:
    _, data, authenticated_identity = authenticated_private_policy_document()
    rules = []
    for rule in data.get("rules") or []:
        mode = str(rule.get("mode") or "literal").strip()
        variants = rule.get("pdf_variants")
        if variants is None and mode == "literal":
            variants = [rule.get("value")]
        variants = [str(value) for value in (variants or []) if str(value)]
        if mode == "regex" and not variants:
            raise SystemExit("authenticated regex redaction rule lacks required pdf_variants")
        if not variants:
            raise SystemExit("authenticated private PDF redaction rule has no searchable variant")
        replacement = str(rule.get("replacement") or "")
        rule_id = str(rule.get("id") or "")
        if not rule_id or not replacement:
            raise SystemExit("authenticated private PDF redaction rule is incomplete")
        rules.append({"id": rule_id, "variants": variants, "replacement": replacement})
    if not rules:
        raise SystemExit("authenticated private policy has no PDF-searchable redaction variants")
    return rules, authenticated_identity

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

def harden_pdf(path: Path, rules: list[dict]) -> tuple[bytes | None, list[dict]]:
    doc = fitz.open(path)
    matches: list[dict] = []
    changed = False

    for page_number, page in enumerate(doc):
        used: list[fitz.Rect] = []
        for rule in rules:
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
                    })
                    changed = True
        if used:
            page.apply_redactions()

    if not changed:
        doc.close()
        return None, []

    # Remove document metadata that can carry local usernames or author details.
    doc.set_metadata({})
    out = path.with_name(path.name + ".privacy.tmp.pdf")
    doc.save(out, garbage=4, clean=True, deflate=True)
    doc.close()

    data = out.read_bytes()
    out.unlink(missing_ok=True)
    return data, matches

def forbidden_hits(path: Path) -> list[str]:
    doc = fitz.open(path)
    text = "\n".join(page.get_text("text") for page in doc)
    doc.close()
    return forbidden_public_identifiers(text)

def main() -> None:
    registry = json.loads(REGISTRY.read_text("utf-8"))
    if not isinstance(registry.get("documents"), list):
        raise SystemExit("canonical document registry missing documents array")

    policy_sha = sha256_file(POLICY)
    pdf_rules, authenticated_policy_identity = private_pdf_rules()
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
        data, matches = harden_pdf(path, pdf_rules)
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
        "authenticated_private_policy_identity": authenticated_policy_identity,
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
