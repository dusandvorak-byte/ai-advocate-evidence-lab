from __future__ import annotations

import json
from pathlib import Path


def manifest_binds_digest(root: Path, manifest: str | None, doc_id: str | None, rel: str, measured_sha: str) -> bool:
    if not manifest or manifest == "filename-reference-date-reconciliation":
        return False
    path = root / manifest
    if not path.is_file():
        return False
    try:
        data = json.loads(path.read_text("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False

    digest = measured_sha.lower()
    bindings = {str(doc_id or ""), rel, "web/" + rel}

    def scalar_text(record: dict) -> str:
        parts = []
        for key, value in record.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                parts.append(str(key))
                parts.append(str(value))
        return "\n".join(parts)

    def walk(node) -> bool:
        if isinstance(node, dict):
            text = scalar_text(node)
            low = text.lower()
            if digest in low and any(binding and binding in text for binding in bindings):
                return True
            return any(walk(value) for value in node.values() if isinstance(value, (dict, list)))
        if isinstance(node, list):
            return any(walk(value) for value in node)
        return False

    return walk(data)
