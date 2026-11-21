#!/usr/bin/env python3
from pathlib import Path

path = Path("scripts/harden-public-pdf-privacy.py")
text = path.read_text("utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    """from publication_redaction import (\n    authenticated_private_policy_document,\n    forbidden_public_identifiers,\n    forbidden_public_identifier_byte_hits,\n    prepared_private_byte_matchers,\n)\n""",
    """from publication_redaction import (\n    authenticated_private_policy_document,\n    forbidden_public_identifiers,\n    forbidden_public_identifier_byte_hits,\n    prepared_private_byte_matchers,\n    redact_public_text,\n)\nfrom public_text_fallback import build_public_text_copy\n""",
    "imports",
)

replace_once(
    """def targeted_pdf_rules(rules: list[dict], rule_ids: list[str]) -> list[dict]:\n    \"\"\"Limit expensive page.search_for calls to rule IDs proven by pdftotext.\"\"\"\n    selected = set(str(rule_id) for rule_id in (rule_ids or []))\n    return [rule for rule in rules if rule[\"id\"] in selected]\n\n\n""",
    """def targeted_pdf_rules(rules: list[dict], rule_ids: list[str]) -> list[dict]:\n    \"\"\"Limit expensive page.search_for calls to rule IDs proven by pdftotext.\"\"\"\n    selected = set(str(rule_id) for rule_id in (rule_ids or []))\n    return [rule for rule in rules if rule[\"id\"] in selected]\n\n\ndef requires_text_fallback(post: dict) -> bool:\n    \"\"\"Use a deterministic text copy only when ordinary hardening is still unsafe.\"\"\"\n    return bool(\n        post.get(\"visible_private_hits\")\n        or post.get(\"decoded_private_hits\")\n        or not post.get(\"text_scan_ok\")\n        or not post.get(\"decoded_scan_ok\")\n        or not post.get(\"pdf_revision_markers_bound\")\n        or not post.get(\"pdf_single_revision_only\")\n    )\n\n\n""",
    "fallback predicate",
)

replace_once(
    """    after_sha = sha256_file(path)\n    if strategy == \"qpdf_rewrite\":\n        post = inspect_qpdf_rewrite_post(path, matchers)\n    else:\n        post = inspect_pdf_deep(path, matchers)\n    after_pages = post.get(\"page_count\")\n""",
    """    if strategy == \"qpdf_rewrite\":\n        post = inspect_qpdf_rewrite_post(path, matchers)\n    else:\n        post = inspect_pdf_deep(path, matchers)\n\n    text_fallback = None\n    if requires_text_fallback(post):\n        text_fallback = build_public_text_copy(\n            path,\n            path,\n            redact_text=redact_public_text,\n            forbidden_text=forbidden_public_identifiers,\n        )\n        post = inspect_pdf_deep(path, matchers)\n        strategy = strategy + \"+text_fallback\"\n\n    after_sha = sha256_file(path)\n    after_pages = post.get(\"page_count\")\n""",
    "worker fallback",
)

replace_once(
    """        \"changed\": data is not None,\n        \"matches\": matches,\n        \"visible_hits\": visible_hits,\n        \"post\": post,\n""",
    """        \"changed\": bool(data is not None or text_fallback is not None),\n        \"matches\": matches,\n        \"text_fallback\": text_fallback,\n        \"visible_hits\": visible_hits,\n        \"post\": post,\n""",
    "candidate evidence",
)

replace_once(
    """                status = str(public.get(\"verification_status\") or \"published\")\n                if \"publication_policy_hardened\" not in status:\n                    public[\"verification_status\"] = status + \"; publication_policy_hardened\"\n                note = str(public.get(\"public_copy_note\") or \"\").strip()\n                hardened_note = (\n                    \"Public policy-hardened copy; source/original SHA is preserved in provenance metadata.\"\n                )\n                if hardened_note not in note:\n                    public[\"public_copy_note\"] = (note + \" \" + hardened_note).strip()\n""",
    """                status = str(public.get(\"verification_status\") or \"published\")\n                status_parts = [part.strip() for part in status.split(\";\") if part.strip()]\n                status_parts.append(\"publication_policy_hardened\")\n                if result.get(\"text_fallback\"):\n                    status_parts.extend([\n                        \"verified_deterministic_public_text_copy\",\n                        \"not_byte_identical_original\",\n                    ])\n                public[\"verification_status\"] = \"; \".join(dict.fromkeys(status_parts))\n                note = str(public.get(\"public_copy_note\") or \"\").strip()\n                hardened_note = (\n                    \"Public policy-hardened copy; source/original SHA is preserved in provenance metadata.\"\n                )\n                if hardened_note not in note:\n                    note = (note + \" \" + hardened_note).strip()\n                if result.get(\"text_fallback\"):\n                    fallback_note = (\n                        \"Verified deterministic public text copy; original graphics, signatures and metadata \"\n                        \"are not reproduced. Source/original SHA-256 and page count are preserved in provenance metadata.\"\n                    )\n                    if fallback_note not in note:\n                        note = (note + \" \" + fallback_note).strip()\n                public[\"public_copy_note\"] = note\n""",
    "registry provenance",
)

old_row = """                \"redaction_matches\": result[\"matches\"],\n                \"trigger_reasons\": inspections[rel][\"reasons\"],\n"""
new_row = """                \"redaction_matches\": result[\"matches\"],\n                \"text_fallback\": result.get(\"text_fallback\"),\n                \"trigger_reasons\": inspections[rel][\"reasons\"],\n"""
count = text.count(old_row)
if count != 2:
    raise SystemExit(f"report rows: expected two targets, found {count}")
text = text.replace(old_row, new_row)

replace_once(
    """        \"schema_version\": \"1.1\",\n""",
    """        \"schema_version\": \"1.2\",\n""",
    "report schema",
)
replace_once(
    """        \"unregistered_hardened_count\": sum(1 for row in rows if not row[\"registered\"] and row[\"changed\"]),\n        \"hard_failure_count\": len(failures),\n""",
    """        \"unregistered_hardened_count\": sum(1 for row in rows if not row[\"registered\"] and row[\"changed\"]),\n        \"text_fallback_count\": sum(1 for row in rows if row.get(\"text_fallback\")),\n        \"hard_failure_count\": len(failures),\n""",
    "report fallback count",
)
path.write_text(text, "utf-8")
