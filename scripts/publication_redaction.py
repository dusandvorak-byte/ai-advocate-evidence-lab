from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "project-memory/private-redaction-policy-contract.json"


class RedactionPolicyError(RuntimeError):
    pass


def _load_contract() -> dict:
    data = json.loads(CONTRACT_PATH.read_text("utf-8"))
    if data.get("status") != "binding":
        raise RedactionPolicyError("private redaction policy contract is not binding")
    if not data.get("policy_id") or not data.get("revision_token"):
        raise RedactionPolicyError("private redaction policy contract is incomplete")
    return data


def _private_policy_path(contract: dict) -> Path:
    env_name = contract.get("private_policy_env") or "EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"
    raw = os.environ.get(env_name, "").strip()
    if not raw:
        raise RedactionPolicyError("required private redaction policy is unavailable")
    path = Path(raw).expanduser().resolve()
    if not path.is_file():
        raise RedactionPolicyError("required private redaction policy is unavailable")
    if not contract.get("allow_private_policy_inside_repository", False):
        try:
            path.relative_to(ROOT.resolve())
        except ValueError:
            pass
        else:
            raise RedactionPolicyError("private redaction policy must not be stored inside the public repository")
    return path


def _compile_rule(rule: dict) -> tuple[str, re.Pattern[str], str]:
    rule_id = str(rule.get("id") or "").strip()
    replacement = str(rule.get("replacement") or "").strip()
    mode = str(rule.get("mode") or "literal").strip()
    value = str(rule.get("value") or "")
    if not rule_id or not replacement or not value:
        raise RedactionPolicyError("private redaction rule is incomplete")
    flags = re.IGNORECASE if rule.get("ignore_case", True) else 0
    if mode == "literal":
        pattern = re.compile(re.escape(value), flags)
    elif mode == "regex":
        pattern = re.compile(value, flags)
    else:
        raise RedactionPolicyError("private redaction rule mode is unsupported")
    return rule_id, pattern, replacement


def _canonical_private_policy_bytes(data: dict) -> bytes:
    signed = {
        "policy_id": data.get("policy_id"),
        "revision": data.get("revision"),
        "revision_token": data.get("revision_token"),
        "rules": data.get("rules") or [],
        "forbidden": data.get("forbidden") or [],
    }
    return json.dumps(signed, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _verify_private_policy_authentication(contract: dict, data: dict) -> str:
    expected = str(contract.get("approved_policy_hmac") or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise RedactionPolicyError("private redaction policy authentication is not provisioned")
    if contract.get("hmac_algorithm") != "sha256":
        raise RedactionPolicyError("private redaction policy HMAC algorithm is unsupported")
    key_env = str(contract.get("hmac_key_env") or "").strip()
    key = os.environ.get(key_env, "") if key_env else ""
    if not key:
        raise RedactionPolicyError("private redaction policy authentication key is unavailable")
    actual = hmac.new(key.encode("utf-8"), _canonical_private_policy_bytes(data), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(actual, expected):
        raise RedactionPolicyError("private redaction policy authentication failed")
    return actual


def authenticated_private_policy_document() -> tuple[dict, dict, str]:
    contract = _load_contract()
    path = _private_policy_path(contract)
    data = json.loads(path.read_text("utf-8"))
    if data.get("policy_id") != contract.get("policy_id"):
        raise RedactionPolicyError("private redaction policy identity mismatch")
    if data.get("revision") != contract.get("revision"):
        raise RedactionPolicyError("private redaction policy revision mismatch")
    if data.get("revision_token") != contract.get("revision_token"):
        raise RedactionPolicyError("private redaction policy token mismatch")
    authenticated_identity = _verify_private_policy_authentication(contract, data)
    return contract, data, authenticated_identity


def load_private_policy() -> tuple[dict, list[tuple[str, re.Pattern[str], str]], list[re.Pattern[str]], str]:
    contract, data, authenticated_identity = authenticated_private_policy_document()

    rules = [_compile_rule(rule) for rule in data.get("rules") or []]
    if not rules:
        raise RedactionPolicyError("private redaction policy has no rules")

    forbidden = []
    for item in data.get("forbidden") or []:
        mode = str(item.get("mode") or "literal").strip()
        value = str(item.get("value") or "")
        if not value:
            raise RedactionPolicyError("private forbidden matcher is incomplete")
        if mode not in {"literal", "regex"}:
            raise RedactionPolicyError("private forbidden matcher mode is unsupported")
        flags = re.IGNORECASE if item.get("ignore_case", True) else 0
        forbidden.append(re.compile(re.escape(value), flags) if mode == "literal" else re.compile(value, flags))
    if not forbidden:
        raise RedactionPolicyError("private redaction policy has no forbidden matchers")

    return contract, rules, forbidden, authenticated_identity


def verified_private_policy_identity() -> str:
    _, _, _, authenticated_identity = load_private_policy()
    return authenticated_identity


def redact_public_text(text: str) -> str:
    _, rules, _, _ = load_private_policy()
    out = text
    for _, pattern, replacement in rules:
        out = pattern.sub(replacement, out)
    return out


def forbidden_public_identifier_byte_hits(raw: bytes) -> list[str]:
    _, data, _ = authenticated_private_policy_document()
    items = list(data.get("rules") or []) + list(data.get("forbidden") or [])
    hits = []
    seen = set()

    decoded_variants = []
    for encoding in ("utf-8", "cp1250", "iso-8859-2", "utf-16-be", "utf-16-le"):
        try:
            decoded_variants.append(raw.decode(encoding, errors="ignore"))
        except LookupError:
            pass

    for index, item in enumerate(items, start=1):
        mode = str(item.get("mode") or "literal").strip()
        value = str(item.get("value") or "")
        if not value:
            continue
        matched = False
        if mode == "literal":
            variants = {value, value.lower(), value.upper(), value.casefold()}
            for variant in variants:
                for encoding in ("utf-8", "cp1250", "iso-8859-2", "utf-16-be", "utf-16-le"):
                    try:
                        encoded = variant.encode(encoding)
                    except UnicodeEncodeError:
                        continue
                    if encoded and encoded in raw:
                        matched = True
                        break
                if matched:
                    break
        elif mode == "regex":
            flags = re.IGNORECASE if item.get("ignore_case", True) else 0
            pattern = re.compile(value, flags)
            matched = any(pattern.search(text) for text in decoded_variants)

        if matched:
            opaque = f"private_raw_match_{index}"
            if opaque not in seen:
                seen.add(opaque)
                hits.append(opaque)

    return hits


def forbidden_public_identifiers(text: str) -> list[str]:
    _, rules, forbidden, _ = load_private_policy()
    # Post-check every redaction rule as well as the explicit forbidden list.
    # De-duplicate identical matcher expressions so reporting stays stable and opaque.
    combined = []
    seen = set()
    for _, pattern, _ in rules:
        key = (pattern.pattern, pattern.flags)
        if key not in seen:
            seen.add(key)
            combined.append(pattern)
    for pattern in forbidden:
        key = (pattern.pattern, pattern.flags)
        if key not in seen:
            seen.add(key)
            combined.append(pattern)
    return [f"private_match_{index + 1}" for index, pattern in enumerate(combined) if pattern.search(text)]


if __name__ == "__main__":
    import sys

    sys.stdout.write(redact_public_text(sys.stdin.read()))
