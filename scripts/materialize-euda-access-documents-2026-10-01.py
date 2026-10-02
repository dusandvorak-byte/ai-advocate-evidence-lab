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
SOURCE = ROOT / "project-memory/state-text-sources-2026-10-01/euda-access-documents-2026-10-01.txt"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-01-euda-access-documents.json"
TARGET = WEB / "documents/report-04082026-010/109-euda-comparability-thc-access-documents-2026-10-01-verejna-kopie.pdf"
ORIGINAL_SHA256 = "d3a61bda167f6cbe0fc77c4e38580d9a427212210585e61ec1b4d330347cef71"
DOCUMENT_ID = "doc-eu-euda-2026-10-01-access-documents-1049-2001"
FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
]

def find_font() -> Path:
    for path in FONT_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("Unicode font not found")

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("EudaAccessUnicode", 7.5)
    canvas.drawCentredString(A4[0] / 2, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()

def main():
    text = SOURCE.read_text("utf-8").strip()
    for required in [
        "Comparability of THC data - Access to documents request",
        "Regulation (EC) No 1049/2001",
        "has been registered",
        "separate procedure",
        "within the time limits laid down in the applicable legislation",
    ]:
        if required not in text:
            raise SystemExit(f"Verified EUDA source text is incomplete: missing {required}")

    pdfmetrics.registerFont(TTFont("EudaAccessUnicode", str(find_font())))
    styles = getSampleStyleSheet()
    warning = ParagraphStyle(
        "warning", parent=styles["Heading2"], fontName="EudaAccessUnicode",
        fontSize=9.2, leading=11.5, alignment=TA_CENTER, spaceAfter=2.5 * mm,
    )
    meta = ParagraphStyle(
        "meta", parent=styles["BodyText"], fontName="EudaAccessUnicode",
        fontSize=7.2, leading=9.1, spaceAfter=3.0 * mm,
    )
    body = ParagraphStyle(
        "body", parent=styles["BodyText"], fontName="EudaAccessUnicode",
        fontSize=8.1, leading=10.2, spaceAfter=1.35 * mm,
    )

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(TARGET), pagesize=A4,
        rightMargin=15 * mm, leftMargin=15 * mm, topMargin=13 * mm, bottomMargin=15 * mm,
        title="EUDA - Comparability of THC data - Access to documents request - verified public copy",
        author="Evidence Lab / verified public copy from complete text of uploaded email PDF",
        invariant=1,
    )
    story = [
        Paragraph("VERIFIED PUBLIC PDF COPY", warning),
        Paragraph(
            "Generated from the complete verified text of the one-page email PDF uploaded by the user. "
            "This copy is not byte-identical to the uploaded PDF. "
            f"Uploaded source SHA-256: {ORIGINAL_SHA256}.",
            meta,
        ),
    ]
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line:
            story.append(Spacer(1, 1.3 * mm))
        else:
            story.append(Paragraph(html.escape(line), body))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    data = TARGET.read_bytes()
    if data[:5] != b"%PDF-" or b"%%EOF" not in data[-2048:] or len(data) < 5000:
        raise SystemExit("Generated EUDA 2026-10-01 public copy is not a complete PDF")

    digest = sha256(TARGET)
    registry = json.loads(REGISTRY.read_text("utf-8"))
    item = next((entry for entry in registry.get("documents", []) if entry.get("id") == DOCUMENT_ID), None)
    if not item:
        raise SystemExit("EUDA 2026-10-01 registry item missing")
    rel = TARGET.relative_to(WEB).as_posix()
    public = item.setdefault("public", {})
    if public.get("intended_pdf") != rel:
        raise SystemExit(f"EUDA 2026-10-01 intended_pdf mismatch: {public.get('intended_pdf')} != {rel}")
    public["pdf"] = rel
    public["sha256"] = digest
    public["verification_status"] = (
        "verified_public_copy_from_complete_text_of_uploaded_email_pdf; "
        f"not_byte_identical_original; uploaded_source_sha256_{ORIGINAL_SHA256}"
    )
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"GENERATED EUDA 2026-10-01 PUBLIC COPY {rel} {digest}")

if __name__ == "__main__":
    main()
