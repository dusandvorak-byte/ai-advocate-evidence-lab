#!/usr/bin/env python3
from __future__ import annotations
import hashlib, shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PAIRS=[
 ("project-memory/binary-transport/2026-10-01/18a17-submission.pdf.bin","web/documents/justice-slalom/2026-10/087-podani-2026-10-01.pdf","69058baab748088ee5d1c1b1fb1ed9931b4f0388ca07351f0343540300399912"),
 ("project-memory/binary-transport/2026-10-01/18a23-submission.pdf.bin","web/documents/justice-slalom/2026-10/088-podani-2026-10-01.pdf","ea6af2bfa418f1c41d2ec4ff2748ac0403336b860094ee9644e854e2b9f6aca7"),
 ("project-memory/binary-transport/2026-10-01/ms18a17-186.pdf.bin","web/documents/report-04082026-010/107-ms-praha-18-a-17-2026-186-2026-09-30.pdf","00db06c75bb6451328a92f66e4b9c0ad810d92dab59f5a049e4231fd841c940c"),
 ("project-memory/binary-transport/2026-10-01/ncoz-20-05-2026.pdf.bin","web/documents/report-04082026-010/108-ncoz-4346-2-cj-2026-410012-2026-05-20.pdf","612e7ac3a5e7b26f6f6c6586552cbd7a09e82256ca8e64e064d9bbe0d05d4869")
]
for src_rel,dst_rel,expected in PAIRS:
    src=ROOT/src_rel
    dst=ROOT/dst_rel
    data=src.read_bytes()
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
        raise SystemExit(f"PDF integrity failure: {src_rel}")
    got=hashlib.sha256(data).hexdigest()
    if got != expected:
        raise SystemExit(f"SHA mismatch {src_rel}: {got}")
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(src,dst)
    if hashlib.sha256(dst.read_bytes()).hexdigest()!=expected:
        raise SystemExit(f"Copied SHA mismatch: {dst_rel}")
    print(f"MATERIALIZED {dst_rel} {expected}")
