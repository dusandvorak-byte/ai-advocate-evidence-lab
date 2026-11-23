#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import os
import stat
import tempfile
from pathlib import Path
from typing import Callable


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


def certify_four_record_public_copy(
    *,
    item: dict,
    expected_original_sha256: str,
    expected_public_path: str,
    web_root: Path,
    deep_scan: Callable[[Path], dict],
) -> dict:
    """Production decision point: certify only a fresh scan of a private
    same-filesystem physical snapshot and publish exactly its scanned bytes.

    The snapshot is a new regular file in a private 0700 directory, never a
    hardlink. All PDF readers are passed the snapshot path, not the source path.
    A competing source writer or changed identity fails closed. The publisher
    atomically moves the same scanned inode into the target path.
    """
    public = item.get("public") or {}
    status = [part.strip() for part in str(public.get("verification_status") or "").split(";") if part.strip()]
    if (
        public.get("pdf") != expected_public_path
        or public.get("source_original_sha256") != expected_original_sha256
        or "verified_deterministic_public_text_copy" not in status
        or "not_byte_identical_original" not in status
    ):
        raise RuntimeError("deterministic public-copy provenance mismatch")
    expected_sha = str(public.get("sha256") or "")
    if len(expected_sha) != 64 or any(c not in "0123456789abcdef" for c in expected_sha):
        raise RuntimeError("missing canonical final public SHA")
    root = Path(web_root).resolve(strict=True)
    path = root / expected_public_path
    if not path.resolve(strict=True).is_relative_to(root) or path.is_symlink():
        raise RuntimeError("unsafe public PDF path")
    if path.parent.is_symlink():
        raise RuntimeError("unsafe public PDF parent")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    source_fd = os.open(path, flags)
    try:
        before = os.fstat(source_fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise RuntimeError("public PDF is not a unique regular file")
        if before.st_size <= 0:
            raise RuntimeError("empty public PDF")
        initial_identity = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        with tempfile.TemporaryDirectory(prefix=".evidence-private-scan-", dir=path.parent) as private_dir:
            private = Path(private_dir)
            os.chmod(private, 0o700)
            snapshot = private / "verified.pdf"
            fd = os.open(snapshot, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
            try:
                snapshot_digest = hashlib.sha256()
                with os.fdopen(fd, "wb", closefd=False) as dest:
                    while True:
                        chunk = os.read(source_fd, 1024 * 1024)
                        if not chunk:
                            break
                        snapshot_digest.update(chunk)
                        dest.write(chunk)
                    dest.flush()
                    os.fsync(fd)
            finally:
                os.close(fd)
            after = os.fstat(source_fd)
            actual = path.lstat()
            after_identity = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
            path_identity = (actual.st_dev, actual.st_ino, actual.st_size, actual.st_mtime_ns, actual.st_ctime_ns)
            if initial_identity != after_identity or initial_identity != path_identity:
                raise RuntimeError("source file changed during snapshot")
            if snapshot_digest.hexdigest() != expected_sha or sha256_file(snapshot) != expected_sha:
                raise RuntimeError("snapshot hash does not match canonical PDF")
            os.chmod(snapshot, 0o400)
            inspection = deep_scan(snapshot)
            if not isinstance(inspection, dict):
                raise RuntimeError("deep PDF inspection missing")
            inspection["scanned_sha256_before"] = snapshot_digest.hexdigest()
            inspection["scanned_sha256_after"] = sha256_file(snapshot)
            if not verify_unchanged_public_copy_scan(
                inspection=inspection, final_public_pdf=snapshot, expected_sha256=expected_sha
            ):
                raise RuntimeError("snapshot failed authenticated deep PDF privacy proof")
            current = path.lstat()
            if (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns, current.st_ctime_ns) != initial_identity:
                raise RuntimeError("public path changed during private scan")
            # The exact inode scanned is atomically promoted to the public tree.
            os.replace(snapshot, path)
            if sha256_file(path) != expected_sha:
                raise RuntimeError("published bytes differ from scanned snapshot")
            public["verification_status"] = "; ".join(dict.fromkeys(status + ["publication_policy_hardened"]))
            item["public"] = public
            return {
                "id": item.get("id"), "public_path": expected_public_path,
                "input_sha256": expected_sha, "output_sha256": expected_sha,
                "page_count": inspection.get("page_count"),
                "changed": False, "strategy": "clean_unchanged_authenticated_private_snapshot",
                "redaction_matches": [], "text_fallback": None,
                "trigger_reasons": [], "known_private_identifier_hits_after": [],
                "decoded_private_identifier_hits_after": [], "registered": True,
            }
    finally:
        os.close(source_fd)
