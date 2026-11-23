#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import fcntl
import os
import subprocess
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



def qpdf_decoded_bytes_sealed(path: Path, *, max_bytes: int = 128 * 1024 * 1024) -> bytes:
    """QPDF output goes to an anonymous kernel FD, never a swappable /tmp path.

    The kernel seals the completed output before the parent inspects bytes.
    A failed, empty or oversize expansion is rejected; no clean result is
    produced from an unauthenticated decoded-stream artifact.
    """
    required = ("F_ADD_SEALS", "F_GET_SEALS", "F_SEAL_WRITE", "F_SEAL_SHRINK",
                "F_SEAL_GROW", "F_SEAL_SEAL")
    if not hasattr(os, "memfd_create") or not hasattr(os, "MFD_ALLOW_SEALING"):
        raise RuntimeError("anonymous sealed qpdf output unsupported")
    if not all(hasattr(fcntl, field) for field in required):
        raise RuntimeError("qpdf output kernel sealing unavailable")
    fd = os.memfd_create("evidence-qpdf-decoded", os.MFD_ALLOW_SEALING | getattr(os, "MFD_CLOEXEC", 0))
    try:
        proc = subprocess.run(
            [
                "qpdf", "--qdf", "--preserve-unreferenced",
                "--object-streams=disable", "--stream-data=uncompress",
                str(path), "-",
            ],
            stdout=fd, stderr=subprocess.PIPE, timeout=120,
        )
        if proc.returncode != 0:
            raise RuntimeError("qpdf decoded-stream extraction failed")
        size = os.fstat(fd).st_size
        if size <= 0 or size > max_bytes:
            raise RuntimeError("qpdf decoded-stream output out of bounds")
        seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SEAL
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
        if (fcntl.fcntl(fd, fcntl.F_GET_SEALS) & seals) != seals:
            raise RuntimeError("qpdf output could not be kernel-sealed")
        os.lseek(fd, 0, os.SEEK_SET)
        chunks = []
        while True:
            chunk = os.read(fd, min(1024 * 1024, size))
            if not chunk:
                break
            chunks.append(chunk)
        decoded = b"".join(chunks)
        if len(decoded) != size:
            raise RuntimeError("sealed qpdf output length changed")
        return decoded
    finally:
        os.close(fd)


def certify_four_record_public_copy(
    *,
    item: dict,
    expected_original_sha256: str,
    expected_public_path: str,
    web_root: Path,
    deep_scan: Callable[[Path], dict],
) -> dict:
    """Seal exact PDF bytes before any scanner reopens them.

    Linux memfd write/grow/shrink seals prevent same-UID writers from swapping
    or mutating the bytes inspected by Poppler, MuPDF and qpdf through the
    /proc/<pid>/fd/<fd> descriptor path. The certified bytes are copied into
    a private same-filesystem file and atomically promoted after hash checks.
    Unsupported kernels/platforms fail closed; no pathname-only scan fallback.
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
    if not all(hasattr(fcntl, key) for key in ("F_ADD_SEALS", "F_GET_SEALS", "F_SEAL_WRITE", "F_SEAL_SHRINK", "F_SEAL_GROW", "F_SEAL_SEAL")):
        raise RuntimeError("kernel file sealing unavailable")
    if not hasattr(os, "memfd_create") or not hasattr(os, "MFD_ALLOW_SEALING"):
        raise RuntimeError("sealed kernel memory files unavailable")
    root = Path(web_root).resolve(strict=True)
    path = root / expected_public_path
    if not path.resolve(strict=True).is_relative_to(root) or path.is_symlink():
        raise RuntimeError("unsafe public PDF path")
    if path.parent.is_symlink():
        raise RuntimeError("unsafe public PDF parent")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    source_fd = os.open(path, flags)
    sealed_fd = -1
    try:
        before = os.fstat(source_fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size <= 0:
            raise RuntimeError("public PDF is not a unique nonempty regular file")
        initial_identity = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        sealed_fd = os.memfd_create("evidence-verified-public-pdf", os.MFD_ALLOW_SEALING | getattr(os, "MFD_CLOEXEC", 0))
        source_digest = hashlib.sha256()
        while True:
            chunk = os.read(source_fd, 1024 * 1024)
            if not chunk:
                break
            source_digest.update(chunk)
            offset = 0
            while offset < len(chunk):
                offset += os.write(sealed_fd, chunk[offset:])
        after = os.fstat(source_fd)
        actual = path.lstat()
        def identity(st):
            return (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns)
        if initial_identity != identity(after) or initial_identity != identity(actual):
            raise RuntimeError("public PDF changed during snapshot")
        if source_digest.hexdigest() != expected_sha:
            raise RuntimeError("input digest not equal to canonical public SHA")
        required_seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
        fcntl.fcntl(sealed_fd, fcntl.F_ADD_SEALS, required_seals)
        if (fcntl.fcntl(sealed_fd, fcntl.F_GET_SEALS) & required_seals) != required_seals:
            raise RuntimeError("kernel refused mandatory snapshot seals")
        # These /proc descriptor bytes are kernel-sealed; reopening the path
        # from helper subprocesses cannot replace it with other PDF contents.
        scan_path = Path(f"/proc/{os.getpid()}/fd/{sealed_fd}")
        if sha256_file(scan_path) != expected_sha:
            raise RuntimeError("sealed snapshot hash mismatch before scanning")
        inspection = deep_scan(scan_path)
        if not isinstance(inspection, dict):
            raise RuntimeError("deep PDF inspection missing")
        inspection["scanned_sha256_before"] = source_digest.hexdigest()
        inspection["scanned_sha256_after"] = sha256_file(scan_path)
        if not verify_unchanged_public_copy_scan(
            inspection=inspection, final_public_pdf=scan_path, expected_sha256=expected_sha,
        ):
            raise RuntimeError("kernel-sealed snapshot failed authenticated deep PDF privacy proof")
        if identity(path.lstat()) != initial_identity:
            raise RuntimeError("public path changed during private scan")
        with tempfile.TemporaryDirectory(prefix=".evidence-private-promotion-", dir=path.parent) as private_dir:
            private = Path(private_dir)
            os.chmod(private, 0o700)
            stage = private / "certified.pdf"
            fd = os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
            try:
                os.lseek(sealed_fd, 0, os.SEEK_SET)
                with os.fdopen(fd, "wb", closefd=False) as destination:
                    while True:
                        chunk = os.read(sealed_fd, 1024 * 1024)
                        if not chunk:
                            break
                        destination.write(chunk)
                    destination.flush()
                    os.fsync(fd)
                if sha256_file(stage) != expected_sha:
                    raise RuntimeError("staged release file differs from immutable scanned bytes")
                os.chmod(stage, 0o644)
                if identity(path.lstat()) != initial_identity:
                    raise RuntimeError("public file replaced during promotion")
                if not stat.S_ISREG(os.fstat(fd).st_mode):
                    raise RuntimeError("staged release descriptor is not regular")
                if os.stat(stage, follow_symlinks=False).st_ino != os.fstat(fd).st_ino:
                    raise RuntimeError("staged release pathname replaced")
                os.replace(stage, path)
            finally:
                os.close(fd)
        if sha256_file(path) != expected_sha:
            raise RuntimeError("published PDF bytes do not match sealed scanned PDF")
        public["verification_status"] = "; ".join(dict.fromkeys(status + ["publication_policy_hardened"]))
        item["public"] = public
        return {
            "id": item.get("id"), "public_path": expected_public_path,
            "input_sha256": expected_sha, "output_sha256": expected_sha,
            "page_count": inspection.get("page_count"),
            "changed": False, "strategy": "kernel_sealed_authenticated_deep_scan",
            "redaction_matches": [], "text_fallback": None,
            "trigger_reasons": [], "known_private_identifier_hits_after": [],
            "decoded_private_identifier_hits_after": [], "registered": True,
        }
    finally:
        if sealed_fd >= 0:
            os.close(sealed_fd)
        os.close(source_fd)
