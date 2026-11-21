#!/usr/bin/env python3
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ns = runpy.run_path(
    str(ROOT / "scripts/diagnose-public-text-fallback.py"),
    run_name="privacy_text_fallback_all_diagnostic",
)

extra_targets = [
    "documents/justice-slalom/2026-07/06-podani-2026-07-10.pdf",
    "documents/justice-slalom/2026-07/41-podani-2026-07-12.pdf",
    "documents/report-25072026-007/04-msz-podnet-2026-05-27.pdf",
    "documents/report-25072026-007/08-osz-prostejov-treti-zadost-2026-07-04.pdf",
    "documents/report-25072026-007/10-ksz-brno-vsz-olomouc-podnet-2026-07-10.pdf",
    "documents/report-25072026-007/11-preventivni-podani-os-pcr-prostejov-2026-07-12.pdf",
    "documents/report-27072026-008/14-ncoz-doplneni-2026-05-12.pdf",
]

main = ns["main"]
main.__globals__["TARGETS"] = list(dict.fromkeys([*ns["TARGETS"], *extra_targets]))
raise SystemExit(main())
