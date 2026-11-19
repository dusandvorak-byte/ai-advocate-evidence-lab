#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import fitz

from publication_redaction import (
    authenticated_private_policy_document,
    forbidden_public_identifiers,
    forbidden_public_identifier_byte_hits,
    prepared_private_byte_matchers,
)

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026.json"
REPORT = ROOT / "project-memory/privacy-hardening-report.json"
POLICY = ROOT / "scripts/publication_redaction.py"

DERIVATIVE_MARKERS = ("generated", "public_copy", "text_copy", "redacted", "not_byte_identical")
FILENAME_DERIVATIVE = re.compile(r"(?i)(verejna|veřejná|textova|textová|redigovan|public[-_ ]?copy)")
SUSPICIOUS_METADATA = re.compile(r"(?i)([\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|/Users/|/home/|[A-Z]:\\\\Users\\\\)")


def private_pdf_rules() -> tuple[list[dict], str]:
    _, data, authenticated_identity = authenticated_private_policy_document()
    rules = []
    for rule in data.get("rules") or []:
        mode = str(rule.get("mode") or "literal").strip()
        variants = rule.get("pdf_variants")
        if variants is None and mode == "literal":
            variants = [rule.get("value")]
        if not isinstance(variants, list) or not variants:
            raise SystemExit("authenticated private PDF redaction rule requires pdf_variants as a nonempty array")
        if any(not isinstance(value, str) or not value for value in variants):
            raise SystemExit("authenticated private PDF redaction rule has an invalid pdf_variants entry")
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


def pdf_revision_envelope(raw: bytes) -> dict:
    eof_matches = list(re.finditer(br"%%EOF", raw))
    startxref_matches = list(re.finditer(br"startxref\s+(\d+)\s+%%EOF", raw))
    suffix_non_whitespace = bool(
        eof_matches and raw[eof_matches[-1].end():].strip()
    )
    offsets = [int(match.group(1)) for match in startxref_matches]
    offsets_unique = len(offsets) == len(set(offsets))
    markers_bound = (
        len(startxref_matches) == len(eof_matches)
        and {match.end() for match in startxref_matches} == {match.end() for match in eof_matches}
    )
    targets_valid = True
    for offset in offsets:
        if offset < 0 or offset >= len(raw):
            targets_valid = False
            break
        tail = raw[offset:offset + 2048]
        traditional = tail.startswith(b"xref")
        stream = bool(re.match(br"\d+\s+\d+\s+obj\b", tail)) and bool(
            re.search(br"/Type\s*/XRef\b", tail)
        )
        if not (traditional or stream):
            targets_valid = False
            break
    single_revision = len(eof_matches) == 1 and len(startxref_matches) == 1
    structurally_bound = bool(
        eof_matches
        and single_revision
        and markers_bound
        and offsets_unique
        and targets_valid
        and not suffix_non_whitespace
    )
    return {
        "pdf_revision_markers_bound": structurally_bound,
        "pdf_single_revision_only": single_revision,
    }


def decoded_private_hits(path: Path, matchers) -> tuple[list[str], bool]:
    tmp_name = None
    try:
        with tempfile.NamedTemporaryFile(prefix="evidence-harden-", suffix=".qdf.pdf", delete=False) as tmp:
            tmp_name = tmp.name
        proc = subprocess.run(
            [
                "qpdf",
                "--qdf",
                "--preserve-unreferenced",
                "--object-streams=disable",
                "--stream-data=uncompress",
                str(path),
                tmp_name,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=120,
        )
        if proc.returncode != 0:
            return ["__decoded_stream_scan_failed__"], False
        decoded = Path(tmp_name).read_bytes()
        return sorted(set(forbidden_public_identifier_byte_hits(decoded, matchers))), True
    except (OSError, subprocess.TimeoutExpired):
        return ["__decoded_stream_scan_failed__"], False
    finally:
        if tmp_name:
            try:
                Path(tmp_name).unlink(missing_ok=True)
            except OSError:
                pass


def inspect_pdf(path: Path, matchers) -> dict:
    raw = path.read_bytes()
    envelope = pdf_revision_envelope(raw)
    decoded_hits, decoded_ok = decoded_private_hits(path, matchers)
    doc = fitz.open(path)
    try:
        metadata_text = "\n".join(str(v) for v in (doc.metadata or {}).values() if v)
        xmp = doc.get_xml_metadata() or ""
        page_count = doc.page_count
    finally:
        doc.close()
    suspicious_metadata = bool(SUSPICIOUS_METADATA.search(metadata_text + "\n" + xmp))
    reasons = []
    if not envelope["pdf_revision_markers_bound"] or not envelope["pdf_single_revision_only"]:
        reasons.append("revision_envelope")
    if decoded_hits:
        reasons.append("private_match")
    if suspicious_metadata:
        reasons.append("suspicious_metadata")
    if not decoded_ok:
        reasons.append("decoded_scan_failed")
    return {
        "page_count": page_count,
        "reasons": reasons,
        "decoded_private_hits": decoded_hits,
        "decoded_scan_ok": decoded_ok,
        **envelope,
    }


def rect_overlaps(rect: fitz.Rect, used: list[fitz.Rect]) -> bool:
    return any((rect & existing).get_area() > 0.15 * min(rect.get_area(), existing.get_area()) for existing in used)


def harden_pdf(path: Path, rules: list[dict], *, force_rewrite: bool) -> tuple[bytes | None, list[dict]]:
    doc = fitz.open(path)
    matches: list[dict] = []
    changed = bool(force_rewrite)

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
                    matches.append({"page": page_number + 1, "rule": rule["id"]})
                    changed = True
        if used:
            page.apply_redactions()

    metadata_present = any(value for value in (doc.metadata or {}).values())
    xml_metadata = doc.get_xml_metadata() or ""
    if metadata_present:
        doc.set_metadata({})
        changed = True
    if xml_metadata:
        if not hasattr(doc, "del_xml_metadata"):
            doc.close()
            raise RuntimeError("PyMuPDF lacks del_xml_metadata; refusing to publish PDF with XMP metadata")
        doc.del_xml_metadata()
        changed = True

    if not changed:
        doc.close()
        return None, []

    out = path.with_name(path.name + ".privacy.tmp.pdf")
    doc.save(out, garbage=4, clean=True, deflate=True)
    doc.close()
    data = out.read_bytes()
    out.unlink(missing_ok=True)
    return data, matches


def forbidden_hits(path: Path) -> list[str]:
    doc = fitz.open(path)
    try:
        text = "\n".join(page.get_text("text") for page in doc)
    finally:
        doc.close()
    return forbidden_public_identifiers(text)


def main() -> None:
    registry = json.loads(REGISTRY.read_text("utf-8"))
    if not isinstance(registry.get("documents"), list):
        raise SystemExit("canonical document registry missing documents array")

    policy_sha = sha256_file(POLICY)
    pdf_rules, authenticated_policy_identity = private_pdf_rules()
    matchers = prepared_private_byte_matchers()
    rows = []
    failures = []

    by_path: dict[str, list[dict]] = {}
    for item in registry["documents"]:
        rel = str((item.get("public") or {}).get("pdf") or "")
        if rel:
            by_path.setdefault(rel, []).append(item)

    physical_paths = sorted(
        p for p in WEB.rglob("*.pdf")
        if p.is_file()
    )
    rel_paths = [p.relative_to(WEB).as_posix() for p in physical_paths]

    inspections: dict[str, dict] = {}
    worker_count = min(8, max(1, len(physical_paths)))
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_map = {
            executor.submit(inspect_pdf, path, matchers): path
            for path in physical_paths
        }
        for future in as_completed(future_map):
            path = future_map[future]
            rel = path.relative_to(WEB).as_posix()
            try:
                inspections[rel] = future.result()
            except Exception as exc:
                inspections[rel] = {
                    "page_count": None,
                    "reasons": ["inspection_failed"],
                    "decoded_private_hits": ["__inspection_failed__"],
                    "decoded_scan_ok": False,
                    "pdf_revision_markers_bound": False,
                    "pdf_single_revision_only": False,
                    "error": type(exc).__name__,
                }

    for rel in rel_paths:
        path = WEB / rel
        items = by_path.get(rel, [])
        inspection = inspections[rel]
        force_policy_copy = any(derivative_doc(item) for item in items)
        needs_hardening = bool(inspection["reasons"]) or force_policy_copy
        if not needs_hardening:
            continue

        before_sha = sha256_file(path)
        before_pages = inspection.get("page_count")
        data, matches = harden_pdf(
            path,
            pdf_rules,
            force_rewrite=bool(inspection["reasons"]),
        )
        if data is not None:
            path.write_bytes(data)

        after_sha = sha256_file(path)
        post = inspect_pdf(path, matchers)
        after_pages = post.get("page_count")
        visible_hits = forbidden_hits(path)

        if before_pages != after_pages:
            failures.append(f"page-count changed during privacy hardening: {rel} {before_pages}->{after_pages}")
        if visible_hits:
            failures.append(f"known private identifier remains after privacy hardening: {rel}: {visible_hits}")
        if post.get("decoded_private_hits"):
            failures.append(
                f"decoded private identifier remains after privacy hardening: {rel}: {post['decoded_private_hits']}"
            )
        if not post.get("decoded_scan_ok"):
            failures.append(f"decoded privacy scan failed after hardening: {rel}")
        if not post.get("pdf_revision_markers_bound") or not post.get("pdf_single_revision_only"):
            failures.append(f"PDF revision envelope remains noncanonical after hardening: {rel}")

        for item in items:
            public = item.get("public") or {}
            if data is not None:
                public.setdefault("source_original_sha256", before_sha)
                if before_pages is not None:
                    public.setdefault("source_original_page_count", before_pages)
                public["sha256"] = after_sha
                status = str(public.get("verification_status") or "published")
                if "publication_policy_hardened" not in status:
                    public["verification_status"] = status + "; publication_policy_hardened"
                note = str(public.get("public_copy_note") or "").strip()
                hardened_note = (
                    "Public policy-hardened copy; source/original SHA is preserved in provenance metadata."
                )
                if hardened_note not in note:
                    public["public_copy_note"] = (note + " " + hardened_note).strip()
                item["public"] = public

            rows.append({
                "id": item.get("id"),
                "public_path": rel,
                "input_sha256": before_sha,
                "output_sha256": after_sha,
                "page_count": after_pages,
                "changed": data is not None,
                "redaction_matches": matches,
                "trigger_reasons": inspection["reasons"],
                "known_private_identifier_hits_after": visible_hits,
                "decoded_private_identifier_hits_after": post.get("decoded_private_hits") or [],
                "registered": True,
            })

        if not items:
            rows.append({
                "id": None,
                "public_path": rel,
                "input_sha256": before_sha,
                "output_sha256": after_sha,
                "page_count": after_pages,
                "changed": data is not None,
                "redaction_matches": matches,
                "trigger_reasons": inspection["reasons"],
                "known_private_identifier_hits_after": visible_hits,
                "decoded_private_identifier_hits_after": post.get("decoded_private_hits") or [],
                "registered": False,
            })

    report = {
        "schema_version": "1.1",
        "policy_file": POLICY.relative_to(ROOT).as_posix(),
        "policy_sha256": policy_sha,
        "authenticated_private_policy_identity": authenticated_policy_identity,
        "physical_pdf_count": len(physical_paths),
        "derivative_count": len(rows),
        "changed_derivative_count": sum(1 for row in rows if row["changed"]),
        "registered_hardened_count": sum(1 for row in rows if row["registered"] and row["changed"]),
        "unregistered_hardened_count": sum(1 for row in rows if not row["registered"] and row["changed"]),
        "hard_failure_count": len(failures),
        "hard_failures": failures,
        "documents": rows,
    }

    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps(report["hard_failures"], ensure_ascii=False))
    print(
        f"Privacy hardening: {report['physical_pdf_count']} PDFs inspected; "
        f"{report['changed_derivative_count']} public copies changed; "
        f"{report['hard_failure_count']} failures"
    )
    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    main()
