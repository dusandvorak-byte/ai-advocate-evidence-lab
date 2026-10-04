#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import lzma
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
PARTS = ROOT / "project-memory/binary-transport/2026-10-04/uoou-2026-10-02"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-02-uoou-necinnost.json"
TARGET = WEB / "documents/justice-slalom/2026-10/089-podani-2026-10-02.pdf"
ORIGINAL_SHA256 = "37791bd52b5237313dc7bc58a9fc2515689f3038cf3f42ef368836012e59da74"
ORIGINAL_SIZE = 193343

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def load_original() -> bytes:
    parts = sorted(PARTS.glob("part-*.xz.b64"))
    if not parts:
        raise SystemExit("Missing ÚOOÚ binary transport parts")
    encoded = "".join(p.read_text("ascii").strip() for p in parts)
    try:
        data = lzma.decompress(base64.b64decode(encoded, validate=True))
    except Exception as exc:
        raise SystemExit(f"Cannot reconstruct ÚOOÚ original: {exc}")
    if len(data) != ORIGINAL_SIZE or sha256(data) != ORIGINAL_SHA256:
        raise SystemExit("ÚOOÚ original size/SHA mismatch")
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
        raise SystemExit("ÚOOÚ original is not a complete PDF")
    return data

def main() -> None:
    data = load_original()
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_bytes(data)

    registry = json.loads(REGISTRY.read_text("utf-8"))
    item = next((x for x in registry["documents"] if x["id"] == "doc-cz-dd-2026-10-02-uoou-stiznost-necinnost"), None)
    if not item:
        raise SystemExit("ÚOOÚ submission registry item missing")
    rel = TARGET.relative_to(WEB).as_posix()
    item["public"]["pdf"] = rel
    item["public"]["sha256"] = ORIGINAL_SHA256
    item["public"]["verification_status"] = "source_pdf_received_binary_original; sha256_verified; 4_pages_reviewed"
    meta = item["justice_slalom"]
    meta["source_sha256"] = ORIGINAL_SHA256
    meta["source_kind"] = "original_pdf_uploaded_by_user"
    meta.pop("public_sha256", None)
    meta.pop("public_copy_manifest", None)
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"MATERIALIZED UOOU ORIGINAL {rel} {ORIGINAL_SHA256}")

if __name__ == "__main__":
    main()
