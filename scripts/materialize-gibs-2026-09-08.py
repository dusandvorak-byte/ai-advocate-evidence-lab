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
OUT = WEB / "documents" / "report-04082026-010"
SOURCE = ROOT / "project-memory/state-text-sources-2026-09-08/gibs-gi-3794-4-cj-2026-840502-p-2026-09-08.txt"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-09-08-gibs.json"
TARGET = OUT / "gibs-gi-3794-4-cj-2026-840502-p-2026-09-08-verejna-kopie.pdf"
MANIFEST = WEB / "data/generated-state-pdf-manifest-2026-09-08-gibs.json"

FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
]

def find_font():
    for path in FONT_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("Unicode font not found")

def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("StateUnicode", 8)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Strana {doc.page}")
    canvas.restoreState()

def main():
    if not SOURCE.exists():
        raise SystemExit(f"Missing verified GIBS text source: {SOURCE}")
    text = SOURCE.read_text(encoding="utf-8").strip()
    if "GI-3794-4/ČJ-2026-840502-P" not in text or "15. a 24.08.2026" not in text or "Policejnímu prezidiu České republiky" not in text:
        raise SystemExit("GIBS source integrity gate failed")
    pdfmetrics.registerFont(TTFont("StateUnicode", str(find_font())))
    styles = getSampleStyleSheet()
    warning = ParagraphStyle("warning", parent=styles["Heading2"], fontName="StateUnicode", fontSize=10, leading=14, alignment=TA_CENTER, spaceAfter=7*mm)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="StateUnicode", fontSize=9.2, leading=12.2, spaceAfter=2.1*mm)
    meta = ParagraphStyle("meta", parent=body, fontSize=8.4, leading=11)
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(TARGET), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=17*mm, bottomMargin=18*mm, title=TARGET.stem, author="Evidence Lab / ověřená veřejná kopie z textového přepisu")
    story = [Paragraph("OVĚŘENÁ VEŘEJNÁ KOPIE PDF", warning), Paragraph("Tato veřejná kopie byla vytvořena z ověřeného úplného textového přepisu nahrané úřední listiny GIBS. Nejde o byte-identický originální PDF soubor a nereprodukuje jeho elektronický podpis ani původní metadata.", meta), Spacer(1,4*mm)]
    for raw in text.splitlines():
        if raw.strip(): story.append(Paragraph(html.escape(raw.rstrip()).replace("  ", "&nbsp;&nbsp;"), body))
        else: story.append(Spacer(1,2*mm))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    if TARGET.read_bytes()[:5] != b"%PDF-": raise SystemExit("Generated GIBS file is not PDF")
    digest = sha256(TARGET)
    rel = TARGET.relative_to(WEB).as_posix()
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    matches = 0
    for item in registry.get("documents", []):
        public = item.get("public") or {}
        if public.get("intended_pdf") == rel:
            public["pdf"] = rel
            public["sha256"] = digest
            public["verification_status"] = "generated_public_copy_from_verified_full_text; not_byte_identical_original"
            item["public"] = public
            matches += 1
    if matches != 1: raise SystemExit(f"GIBS registry patch incomplete: {matches}/1")
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"schema_version":"1.0","notice":"Generated public PDF copy from verified full text; not byte-identical original.","count":1,"records":[{"path":rel,"sha256":digest,"kind":"generated_public_copy_from_verified_full_text","byte_identical_original":False,"source":SOURCE.relative_to(ROOT).as_posix()}]}, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"GENERATED GIBS 2026-09-08 PDF {rel} {digest}")

if __name__ == "__main__":
    main()
