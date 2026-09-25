#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
SOURCE = ROOT / "project-memory/state-text-sources-2026-09-25/euda-exo-fhp-pd-26-d-106.txt"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-09-25-euda-response.json"
TARGET = WEB / "documents/report-04082026-010/101-euda-exo-fhp-pd-26-d-106-2026-09-25-verejna-kopie.pdf"
ORIGINAL_SHA256 = "262744a62b8c396c9e610160780f6fa540c0c37105eb5d6f41b7edfb1b2116d9"
FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
]

def find_font() -> Path:
    for p in FONT_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("Unicode font not found")

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("StateUnicode", 8)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()

def main():
    if not SOURCE.exists() or not SOURCE.read_text("utf-8").strip():
        raise SystemExit("Missing verified EUDA text source")

    pdfmetrics.registerFont(TTFont("StateUnicode", str(find_font())))
    styles = getSampleStyleSheet()
    warning = ParagraphStyle(
        "warning", parent=styles["Heading2"], fontName="StateUnicode",
        fontSize=10, leading=14, alignment=TA_CENTER, spaceAfter=7 * mm,
    )
    body = ParagraphStyle(
        "body", parent=styles["BodyText"], fontName="StateUnicode",
        fontSize=9.0, leading=12.0, spaceAfter=2.0 * mm,
    )
    meta = ParagraphStyle("meta", parent=body, fontSize=8.3, leading=10.8)

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(TARGET), pagesize=A4,
        rightMargin=18 * mm, leftMargin=18 * mm, topMargin=17 * mm, bottomMargin=18 * mm,
        title="EUDA EXO/FHP/pd (26) D 106 – verified public copy",
        author="Evidence Lab / verified public copy from text transcription",
    )
    story = [
        Paragraph("VERIFIED PUBLIC PDF COPY", warning),
        Paragraph(
            "This public copy was generated from a verified text transcription of the uploaded six-page EUDA response dated 25 September 2026. "
            "It is not byte-identical to the original PDF and does not reproduce the original electronic signature or metadata. "
            f"The uploaded original PDF was locally verified as SHA-256 {ORIGINAL_SHA256}.",
            meta,
        ),
        Spacer(1, 4 * mm),
    ]
    for raw in SOURCE.read_text("utf-8").splitlines():
        line = raw.rstrip()
        if not line:
            story.append(Spacer(1, 2 * mm))
        else:
            story.append(Paragraph(html.escape(line).replace("  ", "&nbsp;&nbsp;"), body))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    data = TARGET.read_bytes()
    if data[:5] != b"%PDF-" or b"%%EOF" not in data[-2048:]:
        raise SystemExit("Generated EUDA public copy is not a complete PDF")

    digest = sha256(TARGET)
    registry = json.loads(REGISTRY.read_text("utf-8"))
    matched = 0
    for item in registry.get("documents", []):
        if item.get("id") != "doc-eu-euda-2026-09-25-exo-fhp-pd-26-d-106":
            continue
        public = item.setdefault("public", {})
        rel = TARGET.relative_to(WEB).as_posix()
        if public.get("intended_pdf") != rel:
            raise SystemExit(f"EUDA intended_pdf mismatch: {public.get('intended_pdf')} != {rel}")
        public["pdf"] = rel
        public["sha256"] = digest
        public["verification_status"] = (
            "generated_public_copy_from_verified_text; not_byte_identical_original; "
            f"uploaded_original_sha256_{ORIGINAL_SHA256}"
        )
        matched += 1
    if matched != 1:
        raise SystemExit(f"EUDA registry patch incomplete: {matched}/1")
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"GENERATED EUDA 2026-09-25 PUBLIC COPY {TARGET.relative_to(WEB).as_posix()} {digest}")

if __name__ == "__main__":
    main()
