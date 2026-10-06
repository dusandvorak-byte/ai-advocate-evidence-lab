#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-06-cnb-ms-praha.json"

SPECS = [
    {
        "id": "doc-cz-ekk-2026-10-06-cnb-rb-aml-podnet",
        "pdf": "documents/justice-slalom/2026-10/097-podani-2026-10-06-cnb-raiffeisenbank.pdf",
        "sha256": "a5e5890356ca4f7d520bdda7cbdbff1ffee92f9da9fffa37c9556f991e8252d4",
    },
    {
        "id": "doc-cz-dd-2026-10-06-ms-praha-18a17-18a23-dukazni-doplneni",
        "pdf": "documents/justice-slalom/2026-10/098-podani-2026-10-06-ms-praha-18a17-18a23.pdf",
        "sha256": "6fac4edb59d7e5f67519ec853d810f9fc4a41e5946698ba54b1e7777d173082e",
    },
]

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    registry = json.loads(REGISTRY.read_text("utf-8"))
    docs = {item["id"]: item for item in registry.get("documents", [])}
    for spec in SPECS:
        item = docs.get(spec["id"])
        if not item:
            raise SystemExit("Missing registry item " + spec["id"])
        path = WEB / spec["pdf"]
        if not path.exists():
            raise SystemExit("Missing user-supplied original PDF " + str(path))
        data = path.read_bytes()
        if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
            raise SystemExit("Invalid original PDF " + str(path))
        actual = digest(path)
        if actual != spec["sha256"]:
            raise SystemExit(f"SHA mismatch for {spec['id']}: {actual}")
        if item.get("public", {}).get("pdf") != spec["pdf"] or item.get("public", {}).get("sha256") != spec["sha256"]:
            raise SystemExit("Registry does not point to the byte-identical original for " + spec["id"])
        if item.get("justice_slalom", {}).get("source_kind") != "original_pdf_uploaded_by_user":
            raise SystemExit("Original provenance missing for " + spec["id"])
        if item.get("justice_slalom", {}).get("source_sha256") != spec["sha256"]:
            raise SystemExit("Original source SHA missing for " + spec["id"])
        print("VERIFIED USER ORIGINAL", spec["id"], spec["sha256"])

if __name__ == "__main__":
    main()
