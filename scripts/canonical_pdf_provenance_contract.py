from __future__ import annotations


def validate_frozen_provenance_binding(expected: dict, item: dict) -> list[str]:
    errors = []
    public = item.get("public") or {}
    doc_id = item.get("id")
    if public.get("pdf") != expected.get("path"):
        errors.append(f"{doc_id}: canonical PDF path changed from frozen provenance contract")
    if public.get("sha256_provenance_status") != expected.get("status"):
        errors.append(f"{doc_id}: provenance method/status changed from frozen provenance contract")
    return errors
