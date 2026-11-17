from __future__ import annotations

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


def load_private_policy() -> tuple[dict, list[tuple[str, re.Pattern[str], str]], list[re.Pattern[str]]]:
    contract = _load_contract()
    path = _private_policy_path(contract)
    data = json.loads(path.read_text("utf-8"))
    if data.get("policy_id") != contract.get("policy_id"):
        raise RedactionPolicyError("private redaction policy identity mismatch")
    if data.get("revision") != contract.get("revision"):
        raise RedactionPolicyError("private redaction policy revision mismatch")
    if data.get("revision_token") != contract.get("revision_token"):
        raise RedactionPolicyError("private redaction policy token mismatch")

    rules = [_compile_rule(rule) for rule in data.get("rules") or []]
    if not rules:
        raise RedactionPolicyError("private redaction policy has no rules")

    forbidden = []
    for item in data.get("forbidden") or []:
        mode = str(item.get("mode") or "literal").strip()
        value = str(item.get("value") or "")
        if not value:
            raise RedactionPolicyError("private forbidden matcher is incomplete")
        flags = re.IGNORECASE if item.get("ignore_case", True) else 0
        forbidden.append(re.compile(re.escape(value), flags) if mode == "literal" else re.compile(value, flags))
    if not forbidden:
        raise RedactionPolicyError("private redaction policy has no forbidden matchers")

    return contract, rules, forbidden


def redact_public_text(text: str) -> str:
    _, rules, _ = load_private_policy()
    out = text
    for _, pattern, replacement in rules:
        out = pattern.sub(replacement, out)
    return out


def forbidden_public_identifiers(text: str) -> list[str]:
    _, _, forbidden = load_private_policy()
    # Return only stable opaque matcher labels, never the private values/patterns.
    return [f"private_match_{index + 1}" for index, pattern in enumerate(forbidden) if pattern.search(text)]


if __name__ == "__main__":
    import sys

    sys.stdout.write(redact_public_text(sys.stdin.read()))
