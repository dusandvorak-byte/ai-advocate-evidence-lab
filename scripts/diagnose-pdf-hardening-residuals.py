#!/usr/bin/env python3
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ns = runpy.run_path(
    str(ROOT / "scripts/diagnose-pdf-hardening-stages.py"),
    run_name="privacy_residual_diagnostic_import",
)

ns["TARGETS"] = [
    "documents/justice-slalom/2026-07/44-podani-2026-07-02.pdf",
    "documents/justice-slalom/2026-08/066-podani-2026-08-12.pdf",
    "documents/justice-slalom/2026-09/083-podani-2026-09-27.pdf",
    "documents/justice-slalom/2026-10/101-podani-2026-10-10-ns-nsz-msp-mv-pp.pdf",
    "documents/justice-slalom/2026-10/106-podani-2026-10-15-ombudsman-202602199-redigovany-original.pdf",
    "documents/originaly-2026-11-03/2026-10-16-cnb-2026-167900-cnb-110-original.pdf",
    "documents/report-04082026-010/90-os-prostejov-15-nt-3104-2026-2026-09-14.pdf",
    "documents/report-25072026-007/07-vsz-msz-praha-doplneni-2026-07-02.pdf",
    "documents/report-25072026-007/12-msz-praha-zadost-spis-2026-07-13.pdf",
    "documents/report-25072026-007/18-vsz-praha-1-vzn-1678-2026-70-2026-07-23.pdf",
]
ns["OUT"] = ROOT / "review-artifacts/privacy-hardening-residual-diagnostic.json"
raise SystemExit(ns["main"]())
