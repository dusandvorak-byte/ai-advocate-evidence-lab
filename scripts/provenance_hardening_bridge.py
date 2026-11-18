#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
