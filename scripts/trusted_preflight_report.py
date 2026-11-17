from __future__ import annotations


def sanitize_output_row(row: dict) -> dict:
    return {
        "published_path": row.get("published_path"),
        "source_web_path": row.get("source_web_path"),
        "compatibility_copy": bool(row.get("compatibility_copy")),
        "registered_ids": row.get("registry_ids") or [],
        "registered_statuses": row.get("verification_statuses") or [],
        "derivative": bool(row.get("derivative")),
        "sha256": row.get("sha256"),
        "page_count": row.get("page_count"),
        "metadata_keys_present": row.get("metadata_keys_present") or [],
        "xmp_present": bool(row.get("xmp_present")),
        "embedded_file_count": row.get("embedded_file_count"),
        "file_attachment_annotation_count": row.get("file_attachment_annotation_count"),
        "associated_file_reference_count": row.get("associated_file_reference_count"),
        "embedded_file_object_count": row.get("embedded_file_object_count"),
        "machine_privacy_status": row.get("machine_privacy_status"),
        "checks": row.get("checks") or {},
    }
