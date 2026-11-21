#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import json
import runpy
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepInFrame, Paragraph, Spacer

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from publication_redaction import (  # noqa: E402
    forbidden_public_identifiers,
    redact_public_text,
)

HARDENER = SCRIPTS / "harden-public-pdf-privacy.py"
OUT = ROOT / "review-artifacts/privacy-text-fallback-diagnostic.json"
FONT_NAME = "EvidenceFallbackUnicode"
FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
)

TARGETS = [
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


def hardener_ns() -> dict:
    return runpy.run_path(str(HARDENER), run_name="privacy_text_fallback_diagnostic")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def find_font() -> Path:
    for candidate in FONT_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise RuntimeError("Unicode font unavailable")


def clean_text(value: str) -> str:
    return "".join(
        char if char in "\n\t" or ord(char) >= 32 else " "
        for char in value
    )


def split_poppler_pages(raw: bytes, page_count: int) -> list[str]:
    pages = raw.decode("utf-8", errors="ignore").split("\f")
    while pages and not pages[-1].strip():
        pages.pop()
    if len(pages) < page_count:
        pages.extend([""] * (page_count - len(pages)))
    return pages[:page_count]


def extract_complete_page_text(path: Path) -> tuple[list[str], list[tuple[float, float]], dict]:
    doc = fitz.open(path)
    try:
        page_count = doc.page_count
        sizes = [(float(page.rect.width), float(page.rect.height)) for page in doc]
        fitz_pages = [clean_text(page.get_text("text", sort=True)) for page in doc]
        visual_counts = [
            len(page.get_images(full=True)) + len(page.get_drawings())
            for page in doc
        ]
    finally:
        doc.close()

    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=60,
        )
        poppler_ok = proc.returncode == 0
        poppler_pages = split_poppler_pages(proc.stdout, page_count) if poppler_ok else [""] * page_count
    except (OSError, subprocess.TimeoutExpired):
        poppler_ok = False
        poppler_pages = [""] * page_count

    selected: list[str] = []
    empty_visual_pages: list[int] = []
    redaction_failures: list[int] = []
    source_chars = 0
    public_chars = 0
    for index in range(page_count):
        candidates = [clean_text(fitz_pages[index]), clean_text(poppler_pages[index])]
        source = max(candidates, key=lambda item: len("".join(item.split())))
        if not source.strip() and visual_counts[index]:
            empty_visual_pages.append(index + 1)
        redacted = clean_text(redact_public_text(source))
        if forbidden_public_identifiers(redacted):
            redaction_failures.append(index + 1)
        source_chars += len(source)
        public_chars += len(redacted)
        selected.append(redacted)

    facts = {
        "page_count": page_count,
        "poppler_ok": poppler_ok,
        "source_char_count": source_chars,
        "public_char_count": public_chars,
        "nonempty_page_count": sum(1 for page in selected if page.strip()),
        "empty_visual_pages": empty_visual_pages,
        "redaction_failure_pages": redaction_failures,
    }
    return selected, sizes, facts


def render_text_copy(target: Path, pages: list[str], sizes: list[tuple[float, float]], font_path: Path) -> None:
    if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(font_path)))
    first_size = sizes[0] if sizes else (595.276, 841.89)
    pdf = canvas.Canvas(
        str(target),
        pagesize=first_size,
        pageCompression=1,
        invariant=1,
    )
    pdf.setTitle("Evidence Lab – ověřená veřejná textová kopie")
    pdf.setAuthor("Evidence Lab")
    pdf.setCreator("Evidence Lab deterministic public text fallback")

    for index, (text, size) in enumerate(zip(pages, sizes), start=1):
        width, height = size
        pdf.setPageSize((width, height))
        margin = max(18.0, min(width, height) * 0.035)
        available_width = max(36.0, width - 2 * margin)
        available_height = max(36.0, height - 2 * margin)
        header_style = ParagraphStyle(
            "fallback-header",
            fontName=FONT_NAME,
            fontSize=7.2,
            leading=8.6,
            spaceAfter=4,
        )
        body_style = ParagraphStyle(
            "fallback-body",
            fontName=FONT_NAME,
            fontSize=7.0,
            leading=8.4,
            splitLongWords=True,
        )
        safe = html.escape(text or "[Stránka bez strojově čitelného textu]").replace("\n", "<br/>")
        story = [
            Paragraph(
                "OVĚŘENÁ VEŘEJNÁ TEXTOVÁ KOPIE — "
                f"strana {index}/{len(pages)}. Grafická úprava, podpisy a metadata originálu nejsou reprodukovány.",
                header_style,
            ),
            Spacer(1, 5),
            Paragraph(safe, body_style),
        ]
        frame = KeepInFrame(
            available_width,
            available_height,
            story,
            mode="shrink",
            mergeSpace=True,
        )
        frame.wrapOn(pdf, available_width, available_height)
        frame.drawOn(pdf, margin, margin)
        pdf.showPage()
    pdf.save()


def diagnose_one(rel: str, font_path: Path, mod: dict, matchers) -> dict:
    source = WEB / rel
    row = {"path": rel, "exists": source.is_file()}
    if not source.is_file():
        row["status"] = "missing"
        return row
    try:
        pages, sizes, extraction = extract_complete_page_text(source)
        row["extraction"] = extraction
        if extraction["empty_visual_pages"] or extraction["redaction_failure_pages"]:
            row["status"] = "incomplete_extraction"
            return row
        with tempfile.TemporaryDirectory(prefix="evidence-text-fallback-") as tmp:
            first = Path(tmp) / "first.pdf"
            second = Path(tmp) / "second.pdf"
            render_text_copy(first, pages, sizes, font_path)
            render_text_copy(second, pages, sizes, font_path)
            deterministic = first.read_bytes() == second.read_bytes()
            rebuilt = fitz.open(first)
            try:
                rebuilt_pages = rebuilt.page_count
            finally:
                rebuilt.close()
            post = mod["inspect_pdf_deep"](first, matchers)
            row.update({
                "status": "complete",
                "source_sha256": sha256(source),
                "output_sha256": sha256(first),
                "output_size": first.stat().st_size,
                "deterministic": deterministic,
                "source_page_count": extraction["page_count"],
                "output_page_count": rebuilt_pages,
                "post_reasons": post.get("reasons") or [],
                "visible_hit_ids": sorted(set(post.get("visible_private_hits") or [])),
                "decoded_hit_ids": sorted(set(post.get("decoded_private_hits") or [])),
                "text_scan_ok": bool(post.get("text_scan_ok")),
                "decoded_scan_ok": bool(post.get("decoded_scan_ok")),
                "pdf_revision_markers_bound": bool(post.get("pdf_revision_markers_bound")),
                "pdf_single_revision_only": bool(post.get("pdf_single_revision_only")),
            })
            return row
    except Exception as exc:
        row.update({"status": "error", "error_type": type(exc).__name__})
        return row


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font_path = find_font()
    mod = hardener_ns()
    matchers = mod["prepared_private_byte_matchers"]()
    rows = [diagnose_one(rel, font_path, mod, matchers) for rel in TARGETS]
    summary = {
        "target_count": len(rows),
        "complete_count": sum(1 for row in rows if row.get("status") == "complete"),
        "clean_count": sum(
            1
            for row in rows
            if row.get("status") == "complete"
            and row.get("deterministic")
            and row.get("source_page_count") == row.get("output_page_count")
            and not row.get("post_reasons")
            and row.get("decoded_scan_ok")
            and row.get("pdf_revision_markers_bound")
            and row.get("pdf_single_revision_only")
        ),
        "incomplete_extraction_count": sum(1 for row in rows if row.get("status") == "incomplete_extraction"),
        "error_count": sum(1 for row in rows if row.get("status") == "error"),
    }
    payload = {
        "schema_version": "1.0",
        "purpose": "sanitized deterministic public text-copy fallback verification",
        "secret_values_logged": False,
        "source_text_logged": False,
        "summary": summary,
        "documents": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"summary": summary, "artifact": str(OUT.relative_to(ROOT))}))
    return 0 if summary["clean_count"] == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
