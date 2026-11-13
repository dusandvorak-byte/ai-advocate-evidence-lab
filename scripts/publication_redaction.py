import re

# Binding publication policy:
# - Mgr. Dušan Dvořák remains in full.
# - exact birth date -> year only;
# - private street/house/postcode -> municipality or explicit redaction marker;
# - private email/data-box identifier -> removed from public derivative.
# Source transcripts are never modified by this helper.

RULES = [
    ("private_email", re.compile(r"(?i)\bDusanDvorak@seznam\.cz\b"), "[soukromý e-mail redigován]"),
    ("private_data_box", re.compile(r"(?i)\br8u3nhx\b"), "[ID datové schránky redigováno]"),
    ("exact_birth_date", re.compile(r"\b12\.\s*1\.\s*1962\b"), "1962"),
    ("private_address_full", re.compile(r"(?i)\bOspělov(?:\s+č\.\s*p\.)?\s*6\s*,?\s*798\s*55\s*Ludmírov\b"), "Ludmírov"),
    ("private_address_euda", re.compile(r"(?i)\b798\s*55\s*Ospělov\s*6\b"), "[soukromá poštovní adresa redigována]"),
    ("private_address_house", re.compile(r"(?i)\bOspělov(?:\s+č\.\s*p\.)?\s*6\b"), "[soukromá adresa redigována]"),
    ("private_postcode", re.compile(r"(?i)\b798\s*55\s*Ludmírov\b"), "Ludmírov"),
]

FORBIDDEN_PUBLIC_IDENTIFIERS = [
    re.compile(r"(?i)\bDusanDvorak@seznam\.cz\b"),
    re.compile(r"(?i)\br8u3nhx\b"),
    re.compile(r"\b12\.\s*1\.\s*1962\b"),
    re.compile(r"(?i)\bOspělov(?:\s+č\.\s*p\.)?\s*6\b"),
    re.compile(r"(?i)\b798\s*55\s*Ludmírov\b"),
]

def redact_public_text(text: str) -> str:
    out = text
    for _, pattern, replacement in RULES:
        out = pattern.sub(replacement, out)
    return out

def forbidden_public_identifiers(text: str) -> list[str]:
    return [pattern.pattern for pattern in FORBIDDEN_PUBLIC_IDENTIFIERS if pattern.search(text)]
