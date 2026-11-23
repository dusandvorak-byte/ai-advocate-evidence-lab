#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def is_okte_structural_repair(strategy, redaction_matches, text_fallback) -> bool:
    """Allow structural and metadata repairs with no text transformation."""
    return (
        strategy in ("qpdf_rewrite", "pymupdf_metadata", "pymupdf_rewrite")
        and redaction_matches == []
        and text_fallback is None
    )


def verify_hardening_bridge(
    *,
    hardening_report: dict,
    hardening_row: dict,
    document_id: str,
    public_path: str,
    input_sha256: str,
    expected_output_sha256: str,
    final_public_pdf: Path,
) -> bool:
    """Fail-closed proof that privacy hardening transforms exact input bytes
    into the exact final public bytes for the same document and path.
    """
    if hardening_report.get("hard_failure_count") != 0:
        return False
    if hardening_row.get("id") != document_id:
        return False
    if hardening_row.get("public_path") != public_path:
        return False
    if hardening_row.get("input_sha256") != input_sha256:
        return False
    if hardening_row.get("output_sha256") != expected_output_sha256:
        return False
    if not final_public_pdf.is_file():
        return False
    return sha256_file(final_public_pdf) == expected_output_sha256


def verify_unchanged_public_copy_scan(
    *,
    inspection: dict,
    final_public_pdf: Path,
    expected_sha256: str,
) -> bool:
    """An unchanged generated public copy is privacy-certified only when
    its exact bytes were scanned cleanly by the authenticated policy runner.
    Do not infer certification from an absent candidate/report row alone.
    """
    if not isinstance(expected_sha256, str) or len(expected_sha256) != 64:
        return False
    if not final_public_pdf.is_file():
        return False
    # The deep scan must attest to the same bytes that are being certified.
    if inspection.get("scanned_sha256_before") != expected_sha256:
        return False
    if inspection.get("scanned_sha256_after") != expected_sha256:
        return False
    if inspection.get("reasons") != []:
        return False
    if inspection.get("text_scan_ok") is not True:
        return False
    if inspection.get("decoded_scan_ok") is not True:
        return False
    if inspection.get("qpdf_structurally_valid") is not True:
        return False
    if inspection.get("pdf_revision_markers_bound") is not True:
        return False
    if inspection.get("pdf_single_revision_only") is not True:
        return False
    for key in (
        "visible_private_hits",
        "raw_private_hits",
        "decoded_private_hits",
        "metadata_private_hits",
    ):
        if inspection.get(key) != []:
            return False
    return sha256_file(final_public_pdf) == expected_sha256
