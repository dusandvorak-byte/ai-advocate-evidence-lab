#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "web/documents/report-04082026-010/89-ms-praha-8-ad-9-2026-89-2026-09-09.pdf",
    ROOT / "web/documents/report-04082026-010/91-os-prostejov-15-nt-3106-2026-2026-09-14.pdf",
]

def usable_pdf(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    data = path.read_bytes()
    return data.startswith(b"%PDF-") and b"%%EOF" in data[-2048:]

for target in TARGETS:
    if not target.exists():
        raise SystemExit(f"Missing uploaded PDF to normalize: {target}")
    if usable_pdf(target):
        print(f"PDF already normalized: {target.relative_to(ROOT)}")
        continue
    with tempfile.TemporaryDirectory() as td:
        repaired = Path(td) / target.name
        subprocess.run([
            "gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite",
            "-dPDFSETTINGS=/prepress", f"-sOutputFile={repaired}", str(target)
        ], check=True)
        if not usable_pdf(repaired):
            raise SystemExit(f"Normalized PDF still fails public PDF gate: {target}")
        shutil.copyfile(repaired, target)
    print(f"Normalized uploaded PDF for public delivery: {target.relative_to(ROOT)}")
