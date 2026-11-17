from __future__ import annotations

import hashlib
import re


def canonical_contract_sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def validate_trusted_contract_root(raw: bytes, expected_sha256: str) -> list[str]:
    expected = str(expected_sha256 or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        return ["trusted canonical provenance contract SHA-256 is missing or invalid"]
    actual = canonical_contract_sha256(raw)
    if actual != expected:
        return ["canonical provenance contract does not match trusted external SHA-256 root"]
    return []


def validate_frozen_provenance_binding(expected: dict, item: dict) -> list[str]:
    errors = []
    public = item.get("public") or {}
    doc_id = item.get("id")
    if public.get("pdf") != expected.get("path"):
        errors.append(f"{doc_id}: canonical PDF path changed from frozen provenance contract")
    if public.get("sha256_provenance_status") != expected.get("status"):
        errors.append(f"{doc_id}: provenance method/status changed from frozen provenance contract")
    return errors
