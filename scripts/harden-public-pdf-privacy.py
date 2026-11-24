#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
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
from public_text_fallback import atomic_replace_bytes, build_public_text_copy
from pinned_late_baseline import read_pins, restore_redacted_pin
from provenance_hardening_bridge import is_okte_structural_repair, certify_four_record_public_copy, qpdf_decoded_bytes_sealed

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026.json"
REPORT = ROOT / "project-memory/privacy-hardening-report.json"
POLICY = ROOT / "scripts/publication_redaction.py"
OKTE_STRUCTURAL_COPY_APPROVALS = ROOT / "project-memory/okte-structural-public-copies.json"
OKTE_ANNEX_DIRECTORY = "documents/okte-originaly-2026-10-30/"

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


CANDIDATE_STAGE_SUFFIX = ".candidate.pdf"
COPY_CHUNK_BYTES = 1024 * 1024
# A fallback normalization can run between two full, separately timed checks.
CANDIDATE_WORKER_TIMEOUT_SECONDS = 600


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise RuntimeError("refusing to hash a non-regular PDF path")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            while True:
                chunk = handle.read(COPY_CHUNK_BYTES)
                if not chunk:
                    break
                digest.update(chunk)
    finally:
        os.close(fd)
    return digest.hexdigest()


def create_candidate_stage(path: Path) -> Path:
    path = Path(path)
    if path.is_symlink():
        raise RuntimeError("refusing to stage a symlink PDF")
    source_flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    source_fd = os.open(path, source_flags)
    stage_fd = -1
    stage: Path | None = None
    try:
        source_info = os.fstat(source_fd)
        if not stat.S_ISREG(source_info.st_mode):
            raise RuntimeError("refusing to stage a non-regular PDF")
        stage_fd, stage_name = tempfile.mkstemp(
            prefix=f".{path.name}.",
            suffix=CANDIDATE_STAGE_SUFFIX,
            dir=path.parent,
        )
        stage = Path(stage_name)
        with os.fdopen(source_fd, "rb", closefd=False) as source_handle:
            with os.fdopen(stage_fd, "wb", closefd=False) as stage_handle:
                shutil.copyfileobj(
                    source_handle,
                    stage_handle,
                    length=COPY_CHUNK_BYTES,
                )
                stage_handle.flush()
                os.fsync(stage_handle.fileno())
        os.chmod(stage, stat.S_IMODE(source_info.st_mode))
        return stage
    except Exception:
        if stage is not None:
            stage.unlink(missing_ok=True)
        raise
    finally:
        os.close(source_fd)
        if stage_fd >= 0:
            os.close(stage_fd)


def validate_candidate_stage(stage: Path, target: Path) -> None:
    stage = Path(stage)
    target = Path(target)
    if stage.parent != target.parent:
        raise RuntimeError("candidate stage must share the target directory")
    if target.is_symlink():
        raise RuntimeError("refusing to replace a symlink PDF target")
    if stage.is_symlink() or not stage.is_file():
        raise RuntimeError("candidate stage is not a regular file")
    if not stage.name.startswith(f".{target.name}."):
        raise RuntimeError("candidate stage name does not match target")
    if not stage.name.endswith(CANDIDATE_STAGE_SUFFIX):
        raise RuntimeError("candidate stage suffix mismatch")
    if not stat.S_ISREG(stage.stat().st_mode):
        raise RuntimeError("candidate stage is not regular")


def fsync_directory(directory: Path) -> None:
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    directory_fd = os.open(directory, directory_flags)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def commit_candidate_stage(stage: Path, target: Path) -> None:
    stage = Path(stage)
    target = Path(target)
    validate_candidate_stage(stage, target)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    stage_fd = os.open(stage, flags)
    try:
        if not stat.S_ISREG(os.fstat(stage_fd).st_mode):
            raise RuntimeError("candidate stage changed type before commit")
        os.fsync(stage_fd)
    finally:
        os.close(stage_fd)

    rollback = create_candidate_stage(target)
    replaced = False
    try:
        os.replace(stage, target)
        replaced = True
        fsync_directory(target.parent)
    except Exception:
        if replaced:
            try:
                os.replace(rollback, target)
                rollback = None
                try:
                    fsync_directory(target.parent)
                except OSError:
                    # The original bytes are already restored. Preserve the first
                    # durability error as the authoritative failure.
                    pass
            except Exception as rollback_error:
                raise RuntimeError(
                    "candidate commit failed and rollback could not restore the target"
                ) from rollback_error
        raise
    finally:
        cleanup_candidate_stage(rollback)


def cleanup_candidate_stage(stage: Path | None) -> None:
    if stage is not None:
        Path(stage).unlink(missing_ok=True)


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
    """Decoded stream scan is fail closed and uses kernel-sealed qpdf output."""
    try:
        decoded = qpdf_decoded_bytes_sealed(path)
        return sorted(set(forbidden_public_identifier_byte_hits(decoded, matchers))), True
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError):
        return ["__decoded_stream_scan_failed__"], False


def inspect_pdf_fast(path: Path, matchers) -> dict:
    """Inspect both text channels and the PDF structure before choosing a repair."""
    raw = path.read_bytes()
    envelope = pdf_revision_envelope(raw)
    raw_private_hits = sorted(set(
        forbidden_public_identifier_byte_hits(raw, matchers)
    ))

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
    poppler_text = text_bytes.decode("utf-8", errors="ignore")

    doc = fitz.open(path)
    try:
        page_count = doc.page_count
        mupdf_text = "\n".join(page.get_text("text") for page in doc)
        metadata_text = "\n".join(str(v) for v in (doc.metadata or {}).values() if v)
        xmp = doc.get_xml_metadata() or ""
        embedded_file_count = doc.embfile_count() if hasattr(doc, "embfile_count") else 0
    finally:
        doc.close()

    text = "\n".join((mupdf_text, poppler_text))
    text_private_hits = sorted(set(byte_hits + forbidden_public_identifiers(text)))
    metadata = "\n".join((metadata_text, xmp))
    metadata_hits = forbidden_public_identifiers(metadata)
    visible_hits = sorted(set(byte_hits + forbidden_public_identifiers(text + "\n" + metadata)))
    text_casefold = text.casefold()
    redaction_rule_ids = sorted({
        rule["id"]
        for rule in private_pdf_rules()[0]
        if any(variant.casefold() in text_casefold for variant in rule["variants"])
    }) if text_private_hits else []
    structure_ok = qpdf_structure_valid(path)
    suspicious_metadata = bool(SUSPICIOUS_METADATA.search(metadata_text + "\n" + xmp))

    reasons = []
    if not envelope["pdf_revision_markers_bound"] or not envelope["pdf_single_revision_only"]:
        reasons.append("revision_envelope")
    if visible_hits or raw_private_hits:
        reasons.append("private_match")
    if embedded_file_count:
        reasons.append("embedded_content")
    if suspicious_metadata:
        reasons.append("suspicious_metadata")
    if not text_scan_ok:
        reasons.append("text_scan_failed")
    if not structure_ok:
        reasons.append("qpdf_invalid")

    return {
        "source_sha256": sha256_bytes(raw),
        "page_count": page_count,
        "reasons": reasons,
        "visible_private_hits": visible_hits,
        "raw_private_hits": raw_private_hits,
        "embedded_file_count": embedded_file_count,
        "text_private_hits": text_private_hits,
        "text_redaction_rule_ids": redaction_rule_ids,
        "metadata_private_hits": metadata_hits,
        "text_scan_ok": text_scan_ok,
        "qpdf_structurally_valid": structure_ok,
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


def forbidden_hits(path: Path) -> list[str]:
    doc = fitz.open(path)
    try:
        text = "\n".join(page.get_text("text") for page in doc)
    finally:
        doc.close()
    return forbidden_public_identifiers(text)


def rect_overlaps(rect: fitz.Rect, used: list[fitz.Rect]) -> bool:
    return any((rect & existing).get_area() > 0.15 * min(rect.get_area(), existing.get_area()) for existing in used)


# This historical PDF has a separately pinned, previously audited public
# derivative. Candidate scheduling must not depend on evolving scan heuristics.
# The terminal interpellation validator still checks the exact public digest,
# size, page count, authenticated clean hardening row and archived source.
HISTORIC_INTERPELLATION_PRIMARY = "documents/interpelace-380-2018/interpelace-zuzana-majerova-zahradnikova-2018.pdf"
HISTORIC_INTERPELLATION_SOURCE_SHA = "e5844a961b84628bee2320e6897a4aa52efefa2b616414760655b872ab9b7a71"


def requires_pinned_historical_rewrite(rel: str, inspection: dict) -> bool:
    if rel != HISTORIC_INTERPELLATION_PRIMARY:
        return False
    if inspection.get("source_sha256") != HISTORIC_INTERPELLATION_SOURCE_SHA:
        raise RuntimeError("historical interpellation source identity mismatch")
    return True


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
    qpdf_only_reasons = {"revision_envelope", "text_scan_failed", "qpdf_invalid"}
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
        or post.get("raw_private_hits")
        or post.get("embedded_file_count")
        or post.get("decoded_private_hits")
        or not post.get("text_scan_ok")
        or not post.get("decoded_scan_ok")
        or not post.get("pdf_revision_markers_bound")
        or not post.get("pdf_single_revision_only")
        or post.get("qpdf_structurally_valid") is False
    )


def qpdf_structure_valid(path: Path) -> bool:
    try:
        result = subprocess.run(
            ["qpdf", "--check", str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def canonicalize_pdf_qpdf(path: Path) -> bytes:
    out = path.with_name(path.name + ".qpdf.tmp.pdf")
    try:
        proc = subprocess.run(
            [
                "qpdf",
                "--warning-exit-0",
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
                f"qpdf canonical rewrite failed (exit {proc.returncode})"
            )
        return out.read_bytes()
    finally:
        out.unlink(missing_ok=True)


def qpdf_page_count(path: Path) -> int:
    try:
        proc = subprocess.run(
            ["qpdf", "--show-npages", str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"qpdf page-count failed: {type(exc).__name__}") from exc
    # Warnings may accompany a useful count for the immutable input. The
    # repaired output still needs a strict structure check before commit.
    if proc.returncode not in (0, 3):
        raise RuntimeError(f"qpdf page-count failed with exit code {proc.returncode}")
    try:
        count = int(proc.stdout.decode("ascii", errors="strict").strip())
        if count < 1:
            raise ValueError("no pages")
        return count
    except (ValueError, UnicodeError) as exc:
        raise RuntimeError("qpdf page-count returned invalid output") from exc


def inspect_qpdf_rewrite_post(path: Path, matchers) -> dict:
    """Check the rewritten stage with both text readers and the native object scan."""
    inspection = inspect_pdf_fast(path, matchers)
    decoded_hits, decoded_ok = decoded_private_hits(path, matchers)
    return {
        **inspection,
        "decoded_private_hits": decoded_hits,
        "decoded_scan_ok": decoded_ok,
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
    doc.save(out, garbage=4, clean=True, deflate=True, no_new_id=True)
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
    # Retry the pinned historical source in isolation; inspection failure is not a digest mismatch.
    if result.get("error") and rel == HISTORIC_INTERPELLATION_PRIMARY:
        result = run_isolated_worker("--worker-inspect", rel, timeout=120)
        if result.get("error"):
            raise RuntimeError("historical interpellation inspection failed after retry")
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
    path = WEB / rel
    before_sha = sha256_file(path)
    before_pages = inspection.get("page_count")
    stage: Path | None = None

    def unchanged_failure(message: str, candidate: dict | None = None) -> dict:
        candidate = dict(candidate or {})
        failures = list(candidate.get("failures") or [])
        failures.append(message)
        return {
            "rel": rel,
            "before_sha": before_sha,
            "before_pages": before_pages,
            "after_sha": before_sha,
            "after_pages": before_pages,
            "changed": False,
            "matches": candidate.get("matches") or [],
            "text_fallback": candidate.get("text_fallback"),
            "raw_fallback_hits": candidate.get("raw_fallback_hits") or [],
            "visible_hits": candidate.get("visible_hits") or [],
            "post": candidate.get("post") or inspections_placeholder(rel),
            "failures": failures,
        }

    try:
        if rel == HISTORIC_INTERPELLATION_PRIMARY and (
            not requires_pinned_historical_rewrite(rel, inspection)
            or before_sha != HISTORIC_INTERPELLATION_SOURCE_SHA
        ):
            return unchanged_failure("historical interpellation source changed after inspection")
        stage = create_candidate_stage(path)
        stage_source_sha = sha256_file(stage)
        if stage_source_sha != before_sha:
            return unchanged_failure(
                f"candidate stage source SHA verification failed for {rel}"
            )
        if before_pages is None:
            before_pages = qpdf_page_count(stage)
        stage_rel = stage.relative_to(WEB).as_posix()
        worker_input = {
            "page_count": before_pages,
            "reasons": inspection.get("reasons") or [],
            "visible_private_hits": inspection.get("visible_private_hits") or [],
            "raw_private_hits": inspection.get("raw_private_hits") or [],
            "embedded_file_count": inspection.get("embedded_file_count") or 0,
            "text_private_hits": inspection.get("text_private_hits") or [],
            "text_redaction_rule_ids": inspection.get("text_redaction_rule_ids") or [],
            "metadata_private_hits": inspection.get("metadata_private_hits") or [],
            "xmp_present": bool(inspection.get("xmp_present")),
            "source_sha256": before_sha,
        }
        args = [
            sys.executable,
            str(Path(__file__).resolve()),
            "--worker-candidate",
            rel,
            stage_rel,
            "1" if force_rewrite else "0",
            json.dumps(worker_input, ensure_ascii=False),
        ]
        try:
            proc = subprocess.run(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=CANDIDATE_WORKER_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return unchanged_failure(
                f"privacy hardening worker timed out for {rel}"
            )

        if proc.returncode != 0:
            return unchanged_failure(
                f"privacy hardening worker failed for {rel} with exit code {proc.returncode}"
            )
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
        if not lines:
            return unchanged_failure(
                f"privacy hardening worker returned no result for {rel}"
            )
        try:
            result = json.loads(lines[-1])
        except json.JSONDecodeError:
            return unchanged_failure(
                f"privacy hardening worker returned invalid JSON for {rel}"
            )
        candidate = result.get("candidate")
        if not isinstance(candidate, dict):
            return unchanged_failure(
                f"privacy hardening worker returned no candidate for {rel}"
            )

        provenance_failures = []
        if candidate.get("rel") != rel:
            provenance_failures.append("candidate relation mismatch")
        if candidate.get("before_sha") != before_sha:
            provenance_failures.append("candidate source provenance mismatch")
        if candidate.get("before_pages") != before_pages:
            provenance_failures.append("candidate source page-count provenance mismatch")
        if provenance_failures:
            return unchanged_failure(
                f"candidate provenance validation failed for {rel}: "
                + ", ".join(provenance_failures),
                candidate,
            )

        if candidate.get("failures"):
            rejected = dict(candidate)
            rejected["after_sha"] = before_sha
            rejected["after_pages"] = before_pages
            rejected["changed"] = False
            return rejected

        stage_sha = sha256_file(stage)
        if candidate.get("changed"):
            if candidate.get("after_sha") != stage_sha:
                return unchanged_failure(
                    f"candidate staged SHA verification failed for {rel}",
                    candidate,
                )
            try:
                current_source_sha = sha256_file(path)
            except (OSError, RuntimeError) as exc:
                return unchanged_failure(
                    f"canonical PDF became unverifiable during privacy hardening for {rel}: "
                    + type(exc).__name__,
                    candidate,
                )
            if current_source_sha != before_sha:
                concurrent = unchanged_failure(
                    f"canonical PDF changed during privacy hardening for {rel}",
                    candidate,
                )
                concurrent["after_sha"] = current_source_sha
                return concurrent
            commit_candidate_stage(stage, path)
            stage = None
            committed = dict(candidate)
            committed["before_sha"] = before_sha
            committed["before_pages"] = before_pages
            committed["after_sha"] = stage_sha
            return committed

        if stage_sha != before_sha:
            return unchanged_failure(
                f"unchanged candidate modified its stage for {rel}",
                candidate,
            )
        unchanged = dict(candidate)
        unchanged["before_sha"] = before_sha
        unchanged["before_pages"] = before_pages
        unchanged["after_sha"] = before_sha
        unchanged["after_pages"] = before_pages
        unchanged["changed"] = False
        return unchanged
    finally:
        cleanup_candidate_stage(stage)

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


def validate_worker_stage(rel: str, stage_rel: str) -> tuple[Path, Path]:
    canonical = WEB / rel
    stage = WEB / stage_rel
    if canonical.is_symlink() or not canonical.is_file():
        raise RuntimeError("canonical PDF source is not a regular file")
    validate_candidate_stage(stage, canonical)
    return canonical, stage


def worker_candidate(
    rel: str,
    stage_rel: str,
    force_rewrite: bool,
    before_fast: dict,
) -> None:
    _, path = validate_worker_stage(rel, stage_rel)
    before_sha = str(before_fast.get("source_sha256") or "")
    if not re.fullmatch(r"[0-9a-f]{64}", before_sha):
        raise RuntimeError("missing authoritative source SHA-256")
    before_pages = before_fast.get("page_count")
    pdf_rules, identity = private_pdf_rules()
    matchers = prepared_private_byte_matchers()
    strategy = candidate_strategy(before_fast, force_rewrite)
    restored = restore_redacted_pin(rel, before_sha, before_pages, sha256_file(POLICY), identity)
    prior_transform = None
    matches = []
    data = None
    text_fallback = None
    raw_fallback_hits = []

    if restored is not None:
        data, matches, prior_transform = restored
        strategy = "redact"
    elif strategy == "qpdf_rewrite":
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
                rules_for_worker = pdf_rules
        data, matches = harden_pdf(
            path,
            rules_for_worker,
            force_rewrite=force_rewrite,
            search_private=(strategy == "redact"),
        )
    if data is not None:
        atomic_replace_bytes(path, data)

    if strategy == "qpdf_rewrite":
        post = inspect_qpdf_rewrite_post(path, matchers)
    else:
        post = inspect_pdf_deep(path, matchers)

    if requires_text_fallback(post):
        if prior_transform is not None:
            raise RuntimeError("pinned public bytes no longer pass current privacy policy")
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
    elif text_fallback is not None:
        # A fallback copy is publishable only when the required Poppler scan
        # succeeds. MuPDF-only extraction is not an equivalent privacy gate.
        visible_hits = []
        visible_scan_ok = False
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
    if post.get("raw_private_hits"):
        local_failures.append(
            f"raw private identifier remains after privacy hardening: {rel}: {post['raw_private_hits']}"
        )
    if post.get("embedded_file_count"):
        local_failures.append(
            f"embedded files remain after privacy hardening: {rel}: {post['embedded_file_count']}"
        )
    if post.get("decoded_private_hits"):
        local_failures.append(
            f"decoded private identifier remains after privacy hardening: {rel}: {post['decoded_private_hits']}"
        )
    if not post.get("decoded_scan_ok"):
        local_failures.append(f"decoded privacy scan failed after hardening: {rel}")
    if not post.get("pdf_revision_markers_bound") or not post.get("pdf_single_revision_only"):
        local_failures.append(f"PDF revision envelope remains noncanonical after hardening: {rel}")
    if post.get("qpdf_structurally_valid") is False:
        local_failures.append(f"qpdf structural check failed after hardening: {rel}")
    if raw_fallback_hits:
        local_failures.append(
            f"raw private identifier remains after text fallback: {rel}: {raw_fallback_hits}"
        )

    candidate = {
        "rel": rel,
        "strategy": strategy,
        "prior_transform": prior_transform,
        "before_sha": before_sha,
        "before_pages": before_pages,
        "after_sha": after_sha,
        "after_pages": after_pages,
        "changed": bool(data is not None or text_fallback is not None),
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
    approved_okte = json.loads(OKTE_STRUCTURAL_COPY_APPROVALS.read_text("utf-8"))["records"]
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

    pins = read_pins() if os.environ.get("EVIDENCE_LAB_ENFORCE_LATE_PINS") == "1" else {}
    transform_snapshot = None
    transform_mode = os.environ.get("EVIDENCE_LAB_PDF_TRANSFORM_MODE")
    if transform_mode in ("shadow", "reuse"):
        try:
            from pdf_transform_runtime import capture_current
            transform_snapshot = capture_current(WEB, by_path, policy_sha, authenticated_policy_identity, pins)
        except Exception as exc:
            print("::warning::Optional transform capture unavailable: " + type(exc).__name__, flush=True)
    inspections: dict[str, dict] = {}
    first_results = []
    reused_paths = set()
    # Only exact authenticated prior transformations are eligible. The final
    # independent staged PDF audit and all registry/provenance gates still run.
    if transform_snapshot is not None and transform_mode == "reuse":
        try:
            from pdf_transform_runtime import prepare_reuse, verified_candidate_bytes
            prior_stage, reuse_entries = prepare_reuse(transform_snapshot)
        except Exception as exc:
            print("::warning::Transform reuse unavailable; full hardening: " + type(exc).__name__, flush=True)
            prior_stage, reuse_entries = None, {}
        for rel, row in sorted(reuse_entries.items()):
            path = WEB / rel
            if rel in pins or rel not in by_path or rel not in rel_paths:
                continue
            try:
                data = verified_candidate_bytes(path, row, prior_stage)
            except (OSError, ValueError, TypeError, KeyError):
                continue
            if data is None:
                continue
            stage = create_candidate_stage(path)
            try:
                if sha256_file(stage) != row["source_sha256"]:
                    continue
                atomic_replace_bytes(stage, data)
                if sha256_file(stage) != row["public_sha256"] or sha256_file(path) != row["source_sha256"]:
                    continue
                # Commit failures are not treated as misses: an uncertain
                # filesystem state must fail closed rather than continue.
                commit_candidate_stage(stage, path)
                stage = None
            finally:
                cleanup_candidate_stage(stage)
            if sha256_file(path) != row["public_sha256"]:
                raise RuntimeError("Cached public PDF commit digest mismatch")
            inspections[rel] = {"reasons": row["trigger_reasons"], "page_count": row["page_count"]}
            first_results.append({
                "rel": rel, "before_sha": row["source_sha256"], "after_sha": row["public_sha256"],
                "before_pages": row["page_count"], "after_pages": row["page_count"], "changed": True,
                "matches": row["redaction_matches"], "strategy": row["strategy"], "text_fallback": None,
                "visible_hits": [], "post": {"decoded_private_hits": []}, "failures": [],
                "prior_transform": {"kind": "authenticated_prior_audit_reuse",
                                    "origin": row["prior_origin"], "report_sha256": row["prior_report_sha256"],
                                    "fresh_final_audit_required": True},
            })
            reused_paths.add(rel)
        print(json.dumps({"event": "pdf-transform-reuse", "reused": len(reused_paths),
                          "remaining": len(rel_paths) - len(reused_paths),
                          "fresh_final_audit_required": True}), flush=True)
    first_rel = next((rel for rel, pin in pins.items()
                      if pin["id"] == "doc-cz-dd-2026-10-28-nsz-zasahova-zaloba-podminena"), None)
    # Fail before the general inspection queue on the known release blocker.
    if first_rel:
        if first_rel not in rel_paths or sha256_file(WEB / first_rel) != pins[first_rel]["source_sha256"]:
            raise SystemExit("Pinned NSZ preflight source identity mismatch")
        inspection = inspect_pdf_isolated(WEB / first_rel)
        inspections[first_rel] = inspection
        result = process_candidate_isolated(first_rel, True, inspection)
        if result["failures"] or result["after_sha"] != pins[first_rel]["public_sha256"]:
            raise SystemExit("Pinned NSZ preflight public digest mismatch")
        first_results.append(result)
        print("Pinned NSZ preflight passed before general PDF queue", flush=True)
    remaining_paths = [path for path in physical_paths if path.relative_to(WEB).as_posix() != first_rel and path.relative_to(WEB).as_posix() not in reused_paths]
    worker_count = min(8, max(1, len(remaining_paths)))
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_map = {
            executor.submit(inspect_pdf_isolated, path): path
            for path in remaining_paths
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
        if rel == first_rel or rel in reused_paths:
            continue
        items = by_path.get(rel, [])
        inspection = inspections[rel]
        derivative_xmp_cleanup = (
            any(derivative_doc(item) for item in items)
            and bool(inspection.get("xmp_present"))
        )
        # Reproduce the already-pinned historical public derivative even when
        # the current scanner finds no heuristic trigger. Any newly discovered
        # privacy/structural reasons still control candidate_strategy as usual.
        pinned_rewrite = requires_pinned_historical_rewrite(rel, inspection)
        restore_pin = pins.get(rel, {}).get("kind") == "redact"
        force_rewrite = bool(inspection["reasons"]) or pinned_rewrite or restore_pin
        if force_rewrite or derivative_xmp_cleanup:
            candidates.append((rel, force_rewrite))

    # Check historical pins before the rest of the expensive rewrite queue.
    # These results are used once, not regenerated by the general worker pool.
    candidate_results = first_results
    prioritized = [(rel, force) for rel, force in candidates if rel in pins]
    candidates = [(rel, force) for rel, force in candidates if rel not in pins]
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(prioritized)))) as executor:
        futures = {executor.submit(process_candidate_isolated, rel, force, inspections[rel]): rel
                   for rel, force in prioritized}
        for future in as_completed(futures):
            rel = futures[future]
            result = future.result()
            if result["failures"] or result["after_sha"] != pins[rel]["public_sha256"]:
                raise SystemExit("Pinned PDF preflight failed: " + pins[rel]["id"])
            candidate_results.append(result)
    for rel in pins.keys() - {rel for rel, _ in prioritized}:
        if not (WEB / rel).is_file() or sha256_file(WEB / rel) != pins[rel]["public_sha256"]:
            raise SystemExit("Pinned PDF preflight failed: " + pins[rel]["id"])
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

    if transform_snapshot is not None and transform_mode == "shadow":
        try:
            from pdf_transform_runtime import compare_with_prior
            compare_with_prior(transform_snapshot, candidate_results, WEB)
        except Exception as exc:
            print("::warning::Optional transform shadow comparison unavailable: " + type(exc).__name__, flush=True)

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
                if rel.startswith(OKTE_ANNEX_DIRECTORY) and result["after_sha"] != result["before_sha"]:
                    status_parts = [part for part in status_parts if part != "byte_identical_police_provided_original"]
                    approved_structure = (
                        approved_okte.get(item["id"]) == result["before_sha"]
                        and is_okte_structural_repair(result.get("strategy"), result["matches"], result.get("text_fallback"))
                    )
                    status_parts.append("okte_structural_public_copy" if approved_structure else "not_byte_identical_original")
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
                "strategy": result.get("strategy"),
                "prior_transform": result.get("prior_transform"),
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

    # Source-verified deterministic text copies can pass a clean, unchanged
    # authenticated PDF scan. Earlier link reconciliation must retain their
    # generated-copy provenance; never fabricate a marker for arbitrary PDFs.
    source_sha_by_id = {
        "doc-cz-ks-brn-2026-09-03-9-to-315-2026-140":
            "e565b7e3bb122f00ff04720f1acce031525c1b9c2a2457a87cdac96055ec64a6",
        "doc-cz-ms-pha-2026-10-02-18-a-17-2026-191":
            "394d9db7e01099561138c77382e162b59810a4fdb77f1114b471fdc2e336f293",
        "doc-cz-ksz-brn-2026-10-01-1-kzn-1079-2026-41":
            "f21487295ab845769b9e4a610c7d5fce4f9e7446c3cdc42af8094cf81bdd9f4e",
        "doc-cz-pcr-pp-2026-10-07-ppr-52605-2-cj-2026-990210-pd":
            "796deaddb0723757a023dd27d2f88fc97ef525a7a653ebad1da15c4ee38f2c68",
    }
    path_by_id = {
        "doc-cz-ks-brn-2026-09-03-9-to-315-2026-140":
            "documents/report-04082026-010/110-ks-brno-9-to-315-2026-140-2026-09-03-verejna-textova-kopie.pdf",
        "doc-cz-ms-pha-2026-10-02-18-a-17-2026-191":
            "documents/report-04082026-010/111-ms-praha-18-a-17-2026-191-2026-10-02-verejna-textova-kopie.pdf",
        "doc-cz-ksz-brn-2026-10-01-1-kzn-1079-2026-41":
            "documents/report-04082026-010/113-ksz-brno-1-kzn-1079-2026-41-2026-10-01-verejna-textova-kopie.pdf",
        "doc-cz-pcr-pp-2026-10-07-ppr-52605-2-cj-2026-990210-pd":
            "documents/report-04082026-010/114-ppr-52605-2-cj-2026-990210-pd-2026-10-07-verejna-textova-kopie.pdf",
    }
    oct7_ids = {
        "doc-cz-ksz-brn-2026-10-01-1-kzn-1079-2026-41",
        "doc-cz-pcr-pp-2026-10-07-ppr-52605-2-cj-2026-990210-pd",
    }
    for item in registry["documents"]:
        document_id = item.get("id")
        if document_id not in source_sha_by_id:
            continue
        # For these two newly covered deterministic copies, retain a genuine
        # changed-byte proof if present; the consumer validates its exact hashes.
        # Otherwise require a fresh kernel-sealed authenticated deep scan.
        if document_id in oct7_ids and any(
            existing.get("id") == document_id
            and existing.get("public_path") == path_by_id[document_id]
            and existing.get("changed") is True for existing in rows
        ):
            continue
        try:
            row = certify_four_record_public_copy(
                item=item,
                expected_original_sha256=source_sha_by_id[document_id],
                expected_public_path=path_by_id[document_id],
                web_root=WEB,
                deep_scan=lambda snapshot: inspect_pdf_deep(snapshot, matchers),
            )
            if document_id in oct7_ids:
                # Replace a prior unchanged candidate row with the stronger
                # immutable-snapshot proof; never leave duplicate IDs.
                rows[:] = [existing for existing in rows if not (
                    existing.get("id") == document_id
                    and existing.get("public_path") == path_by_id[document_id]
                )]
            if not any(existing.get("id") == document_id and existing.get("public_path") == path_by_id[document_id] for existing in rows):
                rows.append(row)
        except Exception as exc:
            failures.append(f"Deterministic public-copy private snapshot proof failed: {document_id}: {type(exc).__name__}")


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
    elif len(sys.argv) >= 6 and sys.argv[1] == "--worker-candidate":
        worker_candidate(
            sys.argv[2],
            sys.argv[3],
            sys.argv[4] == "1",
            json.loads(sys.argv[5]),
        )
    else:
        main()
