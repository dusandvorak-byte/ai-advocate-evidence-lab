"""Reuse PDF facts only within the same trusted, exact-checkout release audit.

No persisted cache, private policy values, or cross-run attestations are used.
The caller must supply actual SHA-256 of the registry file and root shard rows
from the current trusted artifact. Missing or conflicting evidence fails closed.
"""
import re


def root_rows_by_path(rows):
    result = {}
    for row in rows:
        if row.get("compatibility_copy") is True:
            continue
        rel = row.get("source_web_path")
        if (row.get("compatibility_copy") is not False or not isinstance(rel, str)
                or not rel or row.get("published_path") != rel or rel in result):
            raise ValueError("invalid or duplicate root PDF audit evidence")
        result[rel] = row
    return result


def registry_facts_from_row(row, rel, actual_sha):
    if (not isinstance(row, dict) or not isinstance(actual_sha, str)
            or not re.fullmatch(r"[a-f0-9]{64}", actual_sha)
            or row.get("published_path") != rel or row.get("source_web_path") != rel
            or row.get("compatibility_copy") is not False
            or row.get("sha256") != actual_sha):
        raise ValueError("missing or mismatched exact-byte root PDF audit evidence")
    checks = row.get("checks")
    if not isinstance(checks, dict):
        raise ValueError("missing shard check results")
    # Every reused property must have been evaluated explicitly. Do not
    # interpret missing data as clean. Existing shard failures remain binding.
    translated = {
        "non_whitespace_prefix_before_pdf_header": ("pdf_header_prefix_clean", True),
        "pdf_eof_present": ("pdf_eof_present", False),
        "pdf_revision_markers_bound": ("pdf_revision_markers_bound", False),
        "pdf_single_revision_only": ("pdf_single_revision_only", False),
        "qpdf_structurally_valid": ("qpdf_structurally_valid", False),
        "non_whitespace_suffix_after_pdf_eof": ("pdf_trailing_payload_absent", True),
        "inline_image_stream_count": ("inline_images_absent", True),
    }
    facts = {}
    for fact, (check, negate) in translated.items():
        value = checks.get(check)
        if type(value) is not bool:
            raise ValueError("missing or invalid shard check: " + check)
        facts[fact] = not value if negate else value
    facts["inline_image_stream_count"] = int(facts["inline_image_stream_count"])
    for field in ("page_count", "known_private_identifier_hits", "machine_privacy_status",
                  "metadata_keys_present", "xmp_present", "embedded_file_count",
                  "file_attachment_annotation_count", "associated_file_reference_count",
                  "embedded_file_object_count", "suspicious_metadata_keys",
                  "xmp_known_private_identifier_hits", "xmp_suspicious"):
        if field not in row:
            raise ValueError("missing shard fact: " + field)
        facts[field] = row[field]
    return facts
