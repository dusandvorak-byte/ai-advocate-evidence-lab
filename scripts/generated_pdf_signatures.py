#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
POLICY = ROOT / "scripts/publication_redaction.py"
GENERATORS = [
    "scripts/materialize-godot-state-text-pdfs.py",
    "scripts/materialize-godot-late-state-pdfs.py",
    "scripts/materialize-uoou-2026-08-26.py",
    "scripts/materialize-euda-2026-09-25.py",
]

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def source_paths(script: str, ns: dict) -> list[Path]:
    paths: list[Path] = []
    if "SOURCES" in ns:
        for items in ns["SOURCES"].values():
            paths.extend(items)
    elif "ITEMS" in ns:
        for item in ns["ITEMS"]:
            if item.get("source"):
                paths.append(item["source"])
    elif ns.get("SOURCE"):
        paths.append(ns["SOURCE"])
    unique = {Path(p).resolve() for p in paths}
    return sorted(unique, key=lambda p: p.as_posix())

def group_signature(script: str) -> dict:
    generator = ROOT / script
    ns = runpy.run_path(str(generator), run_name=f"signature_{generator.stem}")
    components = [generator, POLICY, *source_paths(script, ns)]
    rows = []
    for path in components:
        if not path.exists():
            raise SystemExit(f"Missing signature input: {path}")
        rows.append({
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": sha256(path),
        })
    canonical = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "input_fingerprint": hashlib.sha256(canonical).hexdigest(),
        "components": rows,
    }

def main():
    print(json.dumps({
        "schema_version": "1.0",
        "groups": {script: group_signature(script) for script in GENERATORS},
    }, ensure_ascii=False, sort_keys=True))

if __name__ == "__main__":
    main()
