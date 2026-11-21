#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import runpy
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from public_text_fallback import build_public_text_copy  # noqa: E402
from publication_redaction import (  # noqa: E402
    forbidden_public_identifiers,
    redact_public_text,
)

HARDENER = SCRIPTS / "harden-public-pdf-privacy.py"
OUT = ROOT / "review-artifacts/production-text-fallback-all17.json"

TARGETS = [
    "documents/justice-slalom/2026-07/06-podani-2026-07-10.pdf",
    "documents/justice-slalom/2026-07/41-podani-2026-07-12.pdf",
    "documents/report-25072026-007/04-msz-podnet-2026-05-27.pdf",
    "documents/report-25072026-007/08-osz-prostejov-treti-zadost-2026-07-04.pdf",
    "documents/report-25072026-007/10-ksz-brno-vsz-olomouc-podnet-2026-07-10.pdf",
    "documents/report-25072026-007/11-preventivni-podani-os-pcr-prostejov-2026-07-12.pdf",
    "documents/report-27072026-008/14-ncoz-doplneni-2026-05-12.pdf",
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


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    mod = runpy.run_path(str(HARDENER), run_name="production_text_fallback_all17")
    matchers = mod["prepared_private_byte_matchers"]()
    rows: list[dict] = []

    for rel in TARGETS:
        source = WEB / rel
        row: dict = {"path": rel, "exists": source.is_file()}
        if not source.is_file():
            row["status"] = "missing"
            rows.append(row)
            continue
        try:
            with tempfile.TemporaryDirectory(prefix="evidence-production-fallback-") as tmp:
                target = Path(tmp) / source.name
                facts = build_public_text_copy(
                    source,
                    target,
                    redact_text=redact_public_text,
                    forbidden_text=forbidden_public_identifiers,
                )
                post = mod["inspect_pdf_deep"](target, matchers)
                row.update({
                    "status": "complete",
                    "source_sha256": digest(source),
                    "output_sha256": digest(target),
                    "deterministic": bool(facts.get("deterministic")),
                    "source_page_count": facts.get("source_page_count"),
                    "output_page_count": facts.get("output_page_count"),
                    "source_char_count": facts.get("source_char_count"),
                    "public_char_count": facts.get("public_char_count"),
                    "nonempty_page_count": facts.get("nonempty_page_count"),
                    "poppler_ok": bool(facts.get("poppler_ok")),
                    "post_reasons": post.get("reasons") or [],
                    "visible_hit_ids": sorted(set(post.get("visible_private_hits") or [])),
                    "decoded_hit_ids": sorted(set(post.get("decoded_private_hits") or [])),
                    "text_scan_ok": bool(post.get("text_scan_ok")),
                    "decoded_scan_ok": bool(post.get("decoded_scan_ok")),
                    "pdf_revision_markers_bound": bool(post.get("pdf_revision_markers_bound")),
                    "pdf_single_revision_only": bool(post.get("pdf_single_revision_only")),
                })
        except Exception as exc:
            row.update({"status": "error", "error_type": type(exc).__name__})
        rows.append(row)

    def clean(row: dict) -> bool:
        return bool(
            row.get("status") == "complete"
            and row.get("deterministic")
            and row.get("source_page_count") == row.get("output_page_count")
            and row.get("nonempty_page_count") == row.get("source_page_count")
            and not row.get("post_reasons")
            and not row.get("visible_hit_ids")
            and not row.get("decoded_hit_ids")
            and row.get("text_scan_ok")
            and row.get("decoded_scan_ok")
            and row.get("pdf_revision_markers_bound")
            and row.get("pdf_single_revision_only")
        )

    summary = {
        "target_count": len(rows),
        "present_count": sum(1 for row in rows if row.get("exists")),
        "complete_count": sum(1 for row in rows if row.get("status") == "complete"),
        "clean_count": sum(1 for row in rows if clean(row)),
        "missing_count": sum(1 for row in rows if row.get("status") == "missing"),
        "error_count": sum(1 for row in rows if row.get("status") == "error"),
    }
    payload = {
        "schema_version": "1.0",
        "candidate_sha": "25c664ab0fbf6c7a05c83ffe514838fdf388342f",
        "purpose": "exact production public_text_fallback verification on all 17 real residual PDFs",
        "secret_values_logged": False,
        "source_text_logged": False,
        "summary": summary,
        "documents": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"summary": summary, "artifact": str(OUT.relative_to(ROOT))}))
    return 0 if summary["clean_count"] == len(TARGETS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
