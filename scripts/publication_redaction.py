from __future__ import annotations

import codecs
import hashlib
import hmac
import json
import os
import re
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "project-memory/private-redaction-policy-contract.json"
MAX_PDF_LITERAL_STACK_DEPTH = 262_144


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


def _iter_pdf_decoded_string_payloads(raw: bytes) -> Iterator[bytes]:
    """Yield decoded PDF hex and literal strings in bounded linear time.

    Literal strings are decoded as one streaming top-level segment. Balanced
    nested parentheses are retained as literal content, escapes are decoded
    incrementally, and an unmatched outer literal is still yielded at EOF so
    malformed binary prefixes cannot hide a later identifier. No overlapping
    raw slices are rescanned.
    """
    n = len(raw)
    remaining_budget = max(1_048_576, n * 4)
    hex_chars = b"0123456789abcdefABCDEF"

    i = 0
    while i < n:
        if raw[i] != 60 or (i + 1 < n and raw[i + 1] == 60):
            i += 1
            continue
        j = i + 1
        buf = bytearray()
        valid = True
        while j < n and raw[j] != 62:
            byte = raw[j]
            if byte in b" \t\r\n\x0c\x00":
                j += 1
                continue
            if byte not in hex_chars:
                valid = False
                break
            buf.append(byte)
            if len(buf) > remaining_budget * 2:
                raise RedactionPolicyError("decoded PDF string payload budget exceeded")
            j += 1
        if valid and j < n and raw[j] == 62 and buf:
            if len(buf) % 2:
                buf.append(48)
            try:
                payload = bytes.fromhex(buf.decode("ascii"))
            except ValueError:
                payload = b""
            if payload:
                if len(payload) > remaining_budget:
                    raise RedactionPolicyError("decoded PDF string payload budget exceeded")
                remaining_budget -= len(payload)
                yield payload
            i = j + 1
        else:
            i = max(i + 1, j)

    escapes = {
        ord("n"): 10,
        ord("r"): 13,
        ord("t"): 9,
        ord("b"): 8,
        ord("f"): 12,
        ord("("): 40,
        ord(")"): 41,
        ord("\\"): 92,
    }

    i = 0
    while i < n:
        if raw[i] != 40:
            i += 1
            continue

        depth = 1
        meaningful = False
        payload = bytearray()
        i += 1

        def append_decoded(value: int, *, marks_content: bool = True) -> None:
            nonlocal meaningful
            if len(payload) >= remaining_budget:
                raise RedactionPolicyError("decoded PDF string payload budget exceeded")
            payload.append(value)
            if marks_content:
                meaningful = True

        while i < n and depth:
            byte = raw[i]

            if byte == 92:
                i += 1
                if i >= n:
                    break
                escaped = raw[i]
                if escaped in escapes:
                    append_decoded(escapes[escaped])
                    i += 1
                    continue
                if 48 <= escaped <= 55:
                    digits = bytearray([escaped])
                    i += 1
                    while i < n and len(digits) < 3 and 48 <= raw[i] <= 55:
                        digits.append(raw[i])
                        i += 1
                    append_decoded(int(digits.decode("ascii"), 8) & 255)
                    continue
                if escaped == 13:
                    i += 1
                    if i < n and raw[i] == 10:
                        i += 1
                    continue
                if escaped == 10:
                    i += 1
                    continue
                append_decoded(escaped)
                i += 1
                continue

            if byte == 40:
                depth += 1
                if depth > MAX_PDF_LITERAL_STACK_DEPTH:
                    raise RedactionPolicyError("PDF literal nesting limit exceeded")
                append_decoded(40, marks_content=False)
                i += 1
                continue

            if byte == 41:
                depth -= 1
                if depth:
                    append_decoded(41, marks_content=False)
                i += 1
                continue

            append_decoded(byte)
            i += 1

        if payload and meaningful:
            result = bytes(payload)
            remaining_budget -= len(result)
            yield result


def _pdf_decoded_string_payloads(raw: bytes) -> list[bytes]:
    return list(_iter_pdf_decoded_string_payloads(raw))


def prepared_private_byte_matchers() -> tuple[tuple[str, re.Pattern[str]], ...]:
    _, data, _ = authenticated_private_policy_document()
    items = list(data.get("rules") or []) + list(data.get("forbidden") or [])
    compiled = []
    for index, item in enumerate(items, start=1):
        mode = str(item.get("mode") or "literal").strip()
        value = str(item.get("value") or "")
        if not value:
            continue
        flags = re.IGNORECASE if item.get("ignore_case", True) else 0
        if mode == "literal":
            pattern = re.compile(re.escape(value), flags)
        elif mode == "regex":
            pattern = re.compile(value, flags)
        else:
            continue
        compiled.append((f"private_raw_match_{index}", pattern))
    return tuple(compiled)


def forbidden_public_identifier_byte_hits(
    raw: bytes,
    prepared_matchers: tuple[tuple[str, re.Pattern[str]], ...] | None = None,
    *,
    scan_pdf_strings: bool = True,
) -> list[str]:
    matchers = prepared_matchers if prepared_matchers is not None else prepared_private_byte_matchers()
    if not matchers:
        return []
    matched: set[str] = set()
    encodings = ("utf-8", "cp1250", "iso-8859-2", "utf-16-be", "utf-16-le")

    def scan_candidate(candidate: bytes) -> bool:
        for encoding in encodings:
            offsets = (0, 1) if encoding.startswith("utf-16") and len(candidate) > 1 else (0,)
            for offset in offsets:
                text = codecs.decode(memoryview(candidate)[offset:], encoding, errors="ignore")
                for opaque, pattern in matchers:
                    if opaque not in matched and pattern.search(text):
                        matched.add(opaque)
                if len(matched) == len(matchers):
                    return True
        return False

    if scan_candidate(raw):
        return [opaque for opaque, _ in matchers if opaque in matched]
    if scan_pdf_strings:
        for payload in _iter_pdf_decoded_string_payloads(raw):
            if scan_candidate(payload):
                break
    return [opaque for opaque, _ in matchers if opaque in matched]


def forbidden_public_identifiers(text: str) -> list[str]:
    _, rules, forbidden, _ = load_private_policy()
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
