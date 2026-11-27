"""V3 intake decision only; no scanner, PDF mutation, or publishing authority.

Receipts must come from an independently trusted reviewer/scanner in a future
production gate. This function merely validates a classified review and binds
it to exact candidate bytes and the policy file. It cannot certify raw PDFs.
"""
from pathlib import Path
import hashlib
import json
import re

POLICY_PATH = Path(__file__).with_name("privacy-policy-v3.json")
SHA = re.compile(r"^[0-9a-f]{64}$")
PRIVATE_ROLES = {"private_third_person", "uncertain_role"}
REVIEW_COVERAGE = {"visible_pages", "extracted_text", "decoded_pdf_objects",
                   "metadata_and_attachments", "contextual_third_persons"}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def decision(pdf, review):
    """Return hold, redact, or preserve exact bytes; never authorization."""
    result = {"action": "hold", "publication_authorized": False}
    policy = POLICY_PATH.read_bytes()
    if not isinstance(pdf, bytes) or not pdf.startswith(b"%PDF-") or not isinstance(review, dict):
        return result
    if (review.get("pdf_sha256") != digest(pdf)
            or review.get("policy_sha256") != digest(policy)
            or review.get("explicit_hold") is not False
            or review.get("review_complete") is not True
            or not isinstance(review.get("coverage"), dict)
            or set(review["coverage"]) != REVIEW_COVERAGE
            or not all(v is True for v in review["coverage"].values())
            or not isinstance(review.get("findings"), list)):
        return result
    needs_redaction = False
    for finding in review["findings"]:
        if not isinstance(finding, dict):
            return result
        role, field = finding.get("role"), finding.get("field")
        if role not in {"author", "official_public_capacity", "private_third_person", "uncertain_role"}:
            return result
        if field not in {"name", "initials", "neutral_label", "private_identifier",
                         "sensitive_detail", "hidden_identifier"}:
            return result
        if role == "uncertain_role":
            return result
        if role == "private_third_person":
            if field in {"initials", "neutral_label"} and finding.get("nonidentifying_in_context") is True:
                continue
            needs_redaction = True
        elif field == "name":
            if finding.get("verified_role") is not True:
                return result
            # Author or verified official name alone is not a redaction trigger.
        elif field in {"private_identifier", "sensitive_detail", "hidden_identifier"}:
            needs_redaction = True
        elif finding.get("nonidentifying_in_context") is not True:
            needs_redaction = True
    result["action"] = "redact" if needs_redaction else "preserve_exact_bytes"
    return result
