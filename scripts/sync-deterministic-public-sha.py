from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "project-memory" / "documents-2026.json"
PUBLIC_ROOT = ROOT / "web" / "documents" / "report-04082026-010"

OUTPUT_NAMES = {
    "89-ms-praha-8-ad-9-2026-89-2026-09-09.pdf",
    "91-os-prostejov-15-nt-3106-2026-2026-09-14.pdf",
    "92-ms-praha-9-ad-12-2026-7-2026-09-14.pdf",
    "93-mv-139593-3-tp-2026-2026-09-14.pdf",
    "94-vsz-olomouc-3-vzn-239-2026-64-2026-09-15.pdf",
    "95-dvorak-9-to-315-2026-9-to-316-2026-3-vzn-239-2026-1-kzt-475-2026-1-kzn-1079-2026-2026-09-13.pdf",
}

registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
updated = []

for name in sorted(OUTPUT_NAMES):
    canonical_path = f"documents/report-04082026-010/{name}"
    owners = [
        item for item in registry.get("documents", [])
        if str((item.get("public") or {}).get("pdf") or "") == canonical_path
    ]
    if not owners:
        # Intentionally non-canonical derivative: do not claim registry ownership.
        continue
    if len(owners) != 1:
        raise SystemExit(f"Canonical generated PDF path has {len(owners)} owners: {canonical_path}")

    pdf_path = PUBLIC_ROOT / name
    if not pdf_path.is_file():
        raise SystemExit(f"Canonical generated PDF is missing: {pdf_path}")

    data = pdf_path.read_bytes()
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
        raise SystemExit(f"Canonical generated PDF is invalid: {pdf_path}")

    digest = hashlib.sha256(data).hexdigest()
    public = owners[0].get("public") or {}
    public["sha256"] = digest
    owners[0]["public"] = public
    updated.append(canonical_path)

tmp = REGISTRY.with_suffix(REGISTRY.suffix + ".tmp")
tmp.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
tmp.replace(REGISTRY)
print(f"updated canonical registry SHA for {len(updated)} deterministic public PDFs")
