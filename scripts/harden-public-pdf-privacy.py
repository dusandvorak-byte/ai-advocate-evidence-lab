#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import fitz

from publication_redaction import (
    authenticated_private_policy_document,
    forbidden_public_identifiers,
    forbidden_public_identifier_byte_hits,
    prepared_private_byte_matchers,
    redact_public_text,
)
from public_text_fallback import build_public_text_copy

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


def inspect_pdf_fast(path: Path, matchers) -> dict:
    """Fast candidate selection using native text extraction and cheap metadata/envelope checks."""
    raw = path.read_bytes()
    envelope = pdf_revision_envelope(raw)

    try:
        poppler = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(path), "-"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
        text_scan_ok = poppler.returncode == 0
        text_bytes = poppler.stdout if text_scan_ok else b""
    except (OSError, subprocess.TimeoutExpired):
        text_scan_ok = False
        text_bytes = b""

    byte_hits = sorted(set(forbidden_public_identifier_byte_hits(text_bytes, matchers, scan_pdf_strings=False))) if text_scan_ok else []
    text = text_bytes.decode("utf-8", errors="ignore")
    text_private_hits = sorted(set(byte_hits + forbidden_public_identifiers(text))) if text_scan_ok else []
    text_casefold = text.casefold()
    redaction_rule_ids = sorted({
        rule["id"]
        for rule in private_pdf_rules()[0]
        if any(variant.casefold() in text_casefold for variant in rule["variants"])
    }) if text_scan_ok else []

    doc = fitz.open(path)
    try:
        page_count = doc.page_count
        metadata_text = "\n".join(str(v) for v in (doc.metadata or {}).values() if v)
        xmp = doc.get_xml_metadata() or ""
    finally:
        doc.close()

    metadata_hits = sorted(set(forbidden_public_identifiers(metadata_text + "\n" + xmp)))
    visible_hits = sorted(set(text_private_hits + metadata_hits))
    suspicious_metadata = bool(SUSPICIOUS_METADATA.search(metadata_text + "\n" + xmp))

    reasons = []
    if not envelope["pdf_revision_markers_bound"] or not envelope["pdf_single_revision_only"]:
        reasons.append("revision_envelope")
    if visible_hits:
        reasons.append("private_match")
    if suspicious_metadata:
        reasons.append("suspicious_metadata")
    if not text_scan_ok:
        reasons.append("text_scan_failed")

    return {
        "page_count": page_count,
        "reasons": reasons,
        "visible_private_hits": visible_hits,
        "text_private_hits": text_private_hits,
        "text_redaction_rule_ids": redaction_rule_ids,
        "metadata_private_hits": metadata_hits,
        "text_scan_ok": text_scan_ok,
        "xmp_present": bool(xmp),
        **envelope,
    }


def inspect_pdf_deep(path: Path, matchers) -> dict:
    fast = inspect_pdf_fast(path, matchers)
    decoded_hits, decoded_ok = decoded_private_hits(path, matchers)
    reasons = list(fast["reasons"])
    if decoded_hits and "private_match" not in reasons:
        reasons.append("private_match")
    if not decoded_ok:
        reasons.append("decoded_scan_failed")
    return {
        **fast,
        "reasons": reasons,
        "decoded_private_hits": decoded_hits,
        "decoded_scan_ok": decoded_ok,
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


def forbidden_hits(path: Path) -> list[str]:
    doc = fitz.open(path)
    try:
        text = "\n".join(page.get_text("text") for page in doc)
    finally:
        doc.close()
    return forbidden_public_identifiers(text)


def rect_overlaps(rect: fitz.Rect, used: list[fitz.Rect]) -> bool:
    return any((rect & existing).get_area() > 0.15 * min(rect.get_area(), existing.get_area()) for existing in used)


def candidate_strategy(before_fast: dict, force_rewrite: bool) -> str:
    reasons = set(before_fast.get("reasons") or [])
    text_private_hits = before_fast.get("text_private_hits")
    metadata_private_hits = before_fast.get("metadata_private_hits")
    if "private_match" in reasons and text_private_hits:
        return "redact"
    if (
        "suspicious_metadata" in reasons
        or before_fast.get("xmp_present")
        or metadata_private_hits
    ):
        return "pymupdf_metadata"
    if "private_match" in reasons:
        # Conservative compatibility fallback for older/synthetic inspection payloads
        # that do not distinguish page text from metadata.
        return "redact"
    qpdf_only_reasons = {"revision_envelope", "text_scan_failed"}
    if force_rewrite and reasons and reasons.issubset(qpdf_only_reasons):
        return "qpdf_rewrite"
    if force_rewrite:
        return "pymupdf_rewrite"
    return "verify_only"


def targeted_pdf_rules(rules: list[dict], rule_ids: list[str]) -> list[dict]:
    """Limit expensive page.search_for calls to rule IDs proven by pdftotext."""
    selected = set(str(rule_id) for rule_id in (rule_ids or []))
    return [rule for rule in rules if rule["id"] in selected]


def requires_text_fallback(post: dict) -> bool:
    """Use a deterministic text copy only when ordinary hardening is still unsafe."""
    return bool(
        post.get("visible_private_hits")
        or post.get("decoded_private_hits")
        or not post.get("text_scan_ok")
        or not post.get("decoded_scan_ok")
        or not post.get("pdf_revision_markers_bound")
        or not post.get("pdf_single_revision_only")
    )


def canonicalize_pdf_qpdf(path: Path) -> bytes:
    out = path.with_name(path.name + ".qpdf.tmp.pdf")
    try:
        proc = subprocess.run(
            [
                "qpdf",
                "--deterministic-id",
                "--object-streams=generate",
                "--stream-data=compress",
                "--recompress-flate",
                str(path),
                str(out),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=60,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                "qpdf canonical rewrite failed: "
                + proc.stdout.decode("utf-8", errors="replace")[-2000:]
            )
        return out.read_bytes()
    finally:
        out.unlink(missing_ok=True)


def qpdf_page_count(path: Path) -> int:
    try:
        proc = subprocess.run(
            ["qpdf", "--show-npages", str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"qpdf page-count failed: {type(exc).__name__}") from exc
    if proc.returncode != 0:
        raise RuntimeError(
            "qpdf page-count failed: "
            + proc.stdout.decode("utf-8", errors="replace")[-1000:]
        )
    try:
        return int(proc.stdout.decode("ascii", errors="strict").strip())
    except (ValueError, UnicodeError) as exc:
        raise RuntimeError("qpdf page-count returned invalid output") from exc


def pdftotext_private_hits(path: Path, matchers) -> tuple[list[str], bool]:
    try:
        proc = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(path), "-"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return [], False
    if proc.returncode != 0:
        return [], False
    text_bytes = proc.stdout
    byte_hits = forbidden_public_identifier_byte_hits(text_bytes, matchers, scan_pdf_strings=False)
    text = text_bytes.decode("utf-8", errors="ignore")
    return sorted(set(byte_hits + forbidden_public_identifiers(text))), True


def inspect_qpdf_rewrite_post(path: Path, matchers) -> dict:
    """Bounded post-verification for qpdf-only rewrites; deliberately avoids PyMuPDF."""
    envelope = pdf_revision_envelope(path.read_bytes())
    page_count = qpdf_page_count(path)
    visible_hits, text_scan_ok = pdftotext_private_hits(path, matchers)
    decoded_hits, decoded_ok = decoded_private_hits(path, matchers)
    reasons = []
    if not envelope["pdf_revision_markers_bound"] or not envelope["pdf_single_revision_only"]:
        reasons.append("revision_envelope")
    if visible_hits or decoded_hits:
        reasons.append("private_match")
    if not text_scan_ok:
        reasons.append("text_scan_failed")
    if not decoded_ok:
        reasons.append("decoded_scan_failed")
    return {
        "page_count": page_count,
        "reasons": reasons,
        "visible_private_hits": visible_hits,
        "text_scan_ok": text_scan_ok,
        "xmp_present": False,
        "decoded_private_hits": decoded_hits,
        "decoded_scan_ok": decoded_ok,
        **envelope,
    }


def forbidden_hits_worker(rel: str) -> None:
    path = WEB / rel
    print(json.dumps({"visible_hits": forbidden_hits(path)}, ensure_ascii=False))


def forbidden_hits_isolated(path: Path) -> tuple[list[str], bool]:
    rel = path.relative_to(WEB).as_posix()
    result = run_isolated_worker("--worker-visible", rel, timeout=45)
    if result.get("error"):
        return ["__visible_text_scan_failed__"], False
    return result.get("visible_hits") or [], True


def harden_pdf(
    path: Path,
    rules: list[dict],
    *,
    force_rewrite: bool = False,
    search_private: bool = True,
) -> tuple[bytes | None, list[dict]]:
    doc = fitz.open(path)
    matches: list[dict] = []
    changed = bool(force_rewrite)

    if search_private:
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




def run_isolated_worker(mode: str, rel: str, *, force_rewrite: bool = False, timeout: int) -> dict:
    args = [sys.executable, str(Path(__file__).resolve()), mode, rel]
    if mode == "--worker-candidate":
        args.append("1" if force_rewrite else "0")
    try:
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {
            "rel": rel,
            "worker_timeout": True,
            "error": f"{mode} timed out after {timeout}s",
        }
    if proc.returncode != 0:
        return {
            "rel": rel,
            "worker_timeout": False,
            "error": (proc.stderr or proc.stdout or f"{mode} failed with {proc.returncode}")[-4000:],
        }
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        return {"rel": rel, "worker_timeout": False, "error": f"{mode} returned no JSON"}
    try:
        return json.loads(lines[-1])
    except json.JSONDecodeError:
        return {
            "rel": rel,
            "worker_timeout": False,
            "error": f"{mode} returned invalid JSON: {lines[-1][-1000:]}",
        }


def inspect_pdf_isolated(path: Path) -> dict:
    rel = path.relative_to(WEB).as_posix()
    result = run_isolated_worker("--worker-inspect", rel, timeout=45)
    if result.get("error"):
        return {
            "page_count": None,
            "reasons": ["inspection_timeout" if result.get("worker_timeout") else "inspection_failed"],
            "decoded_private_hits": ["__inspection_failed__"],
            "decoded_scan_ok": False,
            "pdf_revision_markers_bound": False,
            "pdf_single_revision_only": False,
            "error": result["error"],
        }
    return result["inspection"]


def process_candidate_isolated(rel: str, force_rewrite: bool, inspection: dict) -> dict:
    args = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--worker-candidate",
        rel,
        "1" if force_rewrite else "0",
        json.dumps({
            "page_count": inspection.get("page_count"),
            "reasons": inspection.get("reasons") or [],
            "visible_private_hits": inspection.get("visible_private_hits") or [],
            "text_private_hits": inspection.get("text_private_hits") or [],
            "text_redaction_rule_ids": inspection.get("text_redaction_rule_ids") or [],
            "metadata_private_hits": inspection.get("metadata_private_hits") or [],
            "xmp_present": bool(inspection.get("xmp_present")),
        }, ensure_ascii=False),
    ]
    try:
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=330,
        )
    except subprocess.TimeoutExpired:
        result = {
            "rel": rel,
            "worker_timeout": True,
            "error": "--worker-candidate timed out after 330s",
        }
    else:
        if proc.returncode != 0:
            result = {
                "rel": rel,
                "worker_timeout": False,
                "error": (proc.stderr or proc.stdout or f"--worker-candidate failed with {proc.returncode}")[-4000:],
            }
        else:
            lines = [line for line in proc.stdout.splitlines() if line.strip()]
            try:
                result = json.loads(lines[-1]) if lines else {
                    "rel": rel,
                    "worker_timeout": False,
                    "error": "--worker-candidate returned no JSON",
                }
            except json.JSONDecodeError:
                result = {
                    "rel": rel,
                    "worker_timeout": False,
                    "error": f"--worker-candidate returned invalid JSON: {lines[-1][-1000:] if lines else ''}",
                }
    if result.get("error"):
        path = WEB / rel
        return {
            "rel": rel,
            "before_sha": sha256_file(path),
            "before_pages": None,
            "after_sha": sha256_file(path),
            "after_pages": None,
            "changed": False,
            "matches": [],
            "visible_hits": [],
            "post": inspections_placeholder(rel),
            "failures": [
                f"privacy hardening worker {'timed out' if result.get('worker_timeout') else 'failed'} for {rel}: {result['error']}"
            ],
        }
    return result["candidate"]


def inspections_placeholder(rel: str) -> dict:
    return {
        "page_count": None,
        "reasons": ["inspection_failed"],
        "decoded_private_hits": ["__inspection_failed__"],
        "decoded_scan_ok": False,
        "pdf_revision_markers_bound": False,
        "pdf_single_revision_only": False,
        "error": f"isolated worker failed for {rel}",
    }


def worker_inspect(rel: str) -> None:
    path = WEB / rel
    matchers = prepared_private_byte_matchers()
    result = inspect_pdf_fast(path, matchers)
    print(json.dumps({"inspection": result}, ensure_ascii=False))


def worker_candidate(rel: str, force_rewrite: bool, before_fast: dict) -> None:
    path = WEB / rel
    original_bytes = path.read_bytes()
    before_sha = sha256_bytes(original_bytes)
    before_pages = before_fast.get("page_count")
    pdf_rules, _ = private_pdf_rules()
    matchers = prepared_private_byte_matchers()
    strategy = candidate_strategy(before_fast, force_rewrite)
    matches = []
    data = None
    text_fallback = None
    raw_fallback_hits = []

    try:
        if strategy == "qpdf_rewrite":
            data = canonicalize_pdf_qpdf(path)
        elif strategy == "verify_only":
            data = None
        else:
            rules_for_worker = pdf_rules
            if strategy == "redact":
                rules_for_worker = targeted_pdf_rules(
                    pdf_rules,
                    before_fast.get("text_redaction_rule_ids") or [],
                )
                if not rules_for_worker:
                    # Fail safe: never suppress a redaction just because the optimization
                    # could not map the fast-scan hit to an explicit authenticated rule.
                    rules_for_worker = pdf_rules
            data, matches = harden_pdf(
                path,
                rules_for_worker,
                force_rewrite=force_rewrite,
                search_private=(strategy == "redact"),
            )
        if data is not None:
            path.write_bytes(data)

        if strategy == "qpdf_rewrite":
            post = inspect_qpdf_rewrite_post(path, matchers)
        else:
            post = inspect_pdf_deep(path, matchers)

        if requires_text_fallback(post):
            text_fallback = dict(build_public_text_copy(
                path,
                path,
                redact_text=redact_public_text,
                forbidden_text=forbidden_public_identifiers,
            ))
            text_fallback["fallback_input_sha256"] = text_fallback.get("source_sha256")
            text_fallback["fallback_input_page_count"] = text_fallback.get("source_page_count")
            text_fallback["source_sha256"] = before_sha
            text_fallback["source_page_count"] = before_pages
            post = inspect_pdf_deep(path, matchers)
            raw_fallback_hits = sorted(set(
                forbidden_public_identifier_byte_hits(path.read_bytes(), matchers)
            ))
            strategy = strategy + "+text_fallback"

        after_sha = sha256_file(path)
        after_pages = post.get("page_count")
        if post.get("text_scan_ok"):
            visible_hits = post.get("visible_private_hits") or []
            visible_scan_ok = True
        else:
            visible_hits, visible_scan_ok = forbidden_hits_isolated(path)
        local_failures = []
        if before_pages != after_pages:
            local_failures.append(
                f"page-count changed during privacy hardening: {rel} {before_pages}->{after_pages}"
            )
        if not visible_scan_ok:
            local_failures.append(f"visible privacy scan failed after hardening: {rel}")
        elif visible_hits:
            local_failures.append(
                f"known private identifier remains after privacy hardening: {rel}: {visible_hits}"
            )
        if post.get("decoded_private_hits"):
            local_failures.append(
                f"decoded private identifier remains after privacy hardening: {rel}: {post['decoded_private_hits']}"
            )
        if not post.get("decoded_scan_ok"):
            local_failures.append(f"decoded privacy scan failed after hardening: {rel}")
        if not post.get("pdf_revision_markers_bound") or not post.get("pdf_single_revision_only"):
            local_failures.append(f"PDF revision envelope remains noncanonical after hardening: {rel}")
        if raw_fallback_hits:
            local_failures.append(
                f"raw private identifier remains after text fallback: {rel}: {raw_fallback_hits}"
            )

        changed = bool(data is not None or text_fallback is not None)
        if text_fallback is not None and local_failures:
            path.write_bytes(original_bytes)
            after_sha = before_sha
            after_pages = before_pages
            changed = False
    except Exception:
        path.write_bytes(original_bytes)
        raise

    candidate = {
        "rel": rel,
        "strategy": strategy,
        "before_sha": before_sha,
        "before_pages": before_pages,
        "after_sha": after_sha,
        "after_pages": after_pages,
        "changed": changed,
        "matches": matches,
        "text_fallback": text_fallback,
        "raw_fallback_hits": raw_fallback_hits,
        "visible_hits": visible_hits,
        "post": post,
        "failures": local_failures,
    }
    print(json.dumps({"candidate": candidate}, ensure_ascii=False))


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
            executor.submit(inspect_pdf_isolated, path): path
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

    candidates = []
    for rel in rel_paths:
        items = by_path.get(rel, [])
        inspection = inspections[rel]
        derivative_xmp_cleanup = (
            any(derivative_doc(item) for item in items)
            and bool(inspection.get("xmp_present"))
        )
        if inspection["reasons"] or derivative_xmp_cleanup:
            candidates.append((rel, bool(inspection["reasons"])))

    def process_candidate(rel: str, force_rewrite: bool) -> dict:
        path = WEB / rel
        inspection = inspections[rel]
        before_sha = sha256_file(path)
        before_pages = inspection.get("page_count")
        data, matches = harden_pdf(
            path,
            pdf_rules,
            force_rewrite=force_rewrite,
        )
        if data is not None:
            path.write_bytes(data)

        after_sha = sha256_file(path)
        post = inspect_pdf_deep(path, matchers)
        after_pages = post.get("page_count")
        visible_hits = forbidden_hits(path)
        local_failures = []

        if before_pages != after_pages:
            local_failures.append(
                f"page-count changed during privacy hardening: {rel} {before_pages}->{after_pages}"
            )
        if visible_hits:
            local_failures.append(
                f"known private identifier remains after privacy hardening: {rel}: {visible_hits}"
            )
        if post.get("decoded_private_hits"):
            local_failures.append(
                f"decoded private identifier remains after privacy hardening: {rel}: {post['decoded_private_hits']}"
            )
        if not post.get("decoded_scan_ok"):
            local_failures.append(f"decoded privacy scan failed after hardening: {rel}")
        if not post.get("pdf_revision_markers_bound") or not post.get("pdf_single_revision_only"):
            local_failures.append(f"PDF revision envelope remains noncanonical after hardening: {rel}")

        return {
            "rel": rel,
            "before_sha": before_sha,
            "before_pages": before_pages,
            "after_sha": after_sha,
            "after_pages": after_pages,
            "changed": data is not None,
            "matches": matches,
            "visible_hits": visible_hits,
            "post": post,
            "failures": local_failures,
        }

    candidate_results = []
    harden_workers = min(8, max(1, len(candidates)))
    with ThreadPoolExecutor(max_workers=harden_workers) as executor:
        future_map = {
            executor.submit(process_candidate_isolated, rel, force_rewrite, inspections[rel]): rel
            for rel, force_rewrite in candidates
        }
        for future in as_completed(future_map):
            rel = future_map[future]
            try:
                candidate_results.append(future.result())
            except Exception as exc:
                candidate_results.append({
                    "rel": rel,
                    "before_sha": sha256_file(WEB / rel),
                    "before_pages": inspections[rel].get("page_count"),
                    "after_sha": sha256_file(WEB / rel),
                    "after_pages": inspections[rel].get("page_count"),
                    "changed": False,
                    "matches": [],
                    "visible_hits": [],
                    "post": inspections[rel],
                    "failures": [f"privacy hardening worker failed for {rel}: {type(exc).__name__}"],
                })

    for result in sorted(candidate_results, key=lambda row: row["rel"]):
        rel = result["rel"]
        items = by_path.get(rel, [])
        failures.extend(result["failures"])

        for item in items:
            public = item.get("public") or {}
            if result["changed"]:
                public.setdefault("source_original_sha256", result["before_sha"])
                if result["before_pages"] is not None:
                    public.setdefault("source_original_page_count", result["before_pages"])
                public["sha256"] = result["after_sha"]
                status = str(public.get("verification_status") or "published")
                status_parts = [part.strip() for part in status.split(";") if part.strip()]
                status_parts.append("publication_policy_hardened")
                if result.get("text_fallback"):
                    status_parts.extend([
                        "verified_deterministic_public_text_copy",
                        "not_byte_identical_original",
                    ])
                public["verification_status"] = "; ".join(dict.fromkeys(status_parts))
                note = str(public.get("public_copy_note") or "").strip()
                hardened_note = (
                    "Public policy-hardened copy; source/original SHA is preserved in provenance metadata."
                )
                if hardened_note not in note:
                    note = (note + " " + hardened_note).strip()
                if result.get("text_fallback"):
                    fallback_note = (
                        "Verified deterministic public text copy; original graphics, signatures and metadata "
                        "are not reproduced. Source/original SHA-256 and page count are preserved in provenance metadata."
                    )
                    if fallback_note not in note:
                        note = (note + " " + fallback_note).strip()
                public["public_copy_note"] = note
                item["public"] = public

            rows.append({
                "id": item.get("id"),
                "public_path": rel,
                "input_sha256": result["before_sha"],
                "output_sha256": result["after_sha"],
                "page_count": result["after_pages"],
                "changed": result["changed"],
                "redaction_matches": result["matches"],
                "text_fallback": result.get("text_fallback"),
                "trigger_reasons": inspections[rel]["reasons"],
                "known_private_identifier_hits_after": result["visible_hits"],
                "decoded_private_identifier_hits_after": result["post"].get("decoded_private_hits") or [],
                "registered": True,
            })

        if not items:
            rows.append({
                "id": None,
                "public_path": rel,
                "input_sha256": result["before_sha"],
                "output_sha256": result["after_sha"],
                "page_count": result["after_pages"],
                "changed": result["changed"],
                "redaction_matches": result["matches"],
                "text_fallback": result.get("text_fallback"),
                "trigger_reasons": inspections[rel]["reasons"],
                "known_private_identifier_hits_after": result["visible_hits"],
                "decoded_private_identifier_hits_after": result["post"].get("decoded_private_hits") or [],
                "registered": False,
            })

    report = {
        "schema_version": "1.2",
        "policy_file": POLICY.relative_to(ROOT).as_posix(),
        "policy_sha256": policy_sha,
        "authenticated_private_policy_identity": authenticated_policy_identity,
        "physical_pdf_count": len(physical_paths),
        "derivative_count": len(rows),
        "changed_derivative_count": sum(1 for row in rows if row["changed"]),
        "registered_hardened_count": sum(1 for row in rows if row["registered"] and row["changed"]),
        "unregistered_hardened_count": sum(1 for row in rows if not row["registered"] and row["changed"]),
        "text_fallback_count": sum(1 for row in rows if row.get("text_fallback")),
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
    if len(sys.argv) >= 3 and sys.argv[1] == "--worker-inspect":
        worker_inspect(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--worker-visible":
        forbidden_hits_worker(sys.argv[2])
    elif len(sys.argv) >= 5 and sys.argv[1] == "--worker-candidate":
        worker_candidate(sys.argv[2], sys.argv[3] == "1", json.loads(sys.argv[4]))
    else:
        main()
