#!/usr/bin/env python3
from __future__ import annotations

import base64
import gzip
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

ITEMS = [
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-26-uoou.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-26" / "77-uoou-05841-26-3.txt", "target": "77-uoou-05841-26-3-2026-08-26.pdf", "label": "UOOU"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-26-ks-ostrava.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-26" / "78-ks-ostrava-st-82-2026.txt", "target": "78-ks-ostrava-st-82-2026-15-t-11-2025-2026-08-26.pdf", "label": "KS OSTRAVA"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-27-szu-msz.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-27" / "79-szu-10724-2026-2026-08-25.txt", "target": "79-szu-10724-2026-2026-08-25.pdf", "label": "SZU 25-08"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-27-szu-msz.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-27" / "80-szu-10724-2026-decision-2026-08-26.txt", "target": "80-szu-10724-2026-rozhodnuti-2026-08-26.pdf", "label": "SZU 26-08"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-27-szu-msz.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-27" / "81-msz-praha-3-kzn-974-2026-100-2026-08-27.txt", "target": "81-msz-praha-3-kzn-974-2026-100-2026-08-27.pdf", "label": "MSZ PRAHA 27-08"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-27-msz-103.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-27" / "83-msz-praha-3-kzn-974-2026-103-2026-08-27.txt", "target": "83-msz-praha-3-kzn-974-2026-103-2026-08-27.pdf", "label": "MSZ PRAHA 27-08 OSZ7"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-28-ms-8-ad-9.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-28" / "82-ms-praha-8-ad-9-2026-85-2026-08-28.txt", "target": "82-ms-praha-8-ad-9-2026-85-2026-08-28.pdf", "label": "MS PRAHA 8 AD 9 28-08"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-31-mk-church.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-31" / "84-mk-53547-2026-socns.txt", "target": "84-mk-53547-2026-socns-2026-08-31.pdf", "label": "MK 53547 31-08"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-08-31-mk-church.json", "source": ROOT / "project-memory" / "state-text-sources-2026-08-31" / "85-mk-53559-2026-socns.txt", "target": "85-mk-53559-2026-socns-2026-08-31.pdf", "label": "MK 53559 31-08"},
    {"registry": ROOT / "project-memory" / "documents-2026-supplement-2026-09-01-msz-108.json", "source": ROOT / "project-memory" / "state-text-sources-2026-09-01" / "87-msz-praha-3-kzn-974-2026-108-2026-09-01.txt.gz.b64", "target": "87-msz-praha-3-kzn-974-2026-108-2026-09-01.pdf", "label": "MSZ PRAHA 01-09 108"},
]

FONT_CANDIDATES = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/dejavu/DejaVuSans.ttf")]

def find_font():
    for p in FONT_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("Unicode font not found")

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def read_source_text(source: Path) -> str:
    if source.name.endswith('.txt.gz.b64'):
        try:
            return gzip.decompress(base64.b64decode(source.read_text(encoding='ascii').strip())).decode('utf-8')
        except Exception as exc:
            raise SystemExit(f"Cannot decode compressed verified text source {source}: {exc}") from exc
    return source.read_text(encoding="utf-8")

def page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("StateUnicode", 8)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Strana {doc.page}")
    canvas.restoreState()

def materialize(item, warning, body, meta):
    source = item["source"]
    registry_path = item["registry"]
    if not source.exists():
        raise SystemExit(f"Missing source {source}")
    if not registry_path.exists():
        raise SystemExit(f"Missing registry {registry_path}")
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / item["target"]
    doc = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=17*mm, bottomMargin=18*mm, title=target.stem, author="Evidence Lab / veřejná kopie z ověřeného textového přepisu")
    story = [Paragraph("OVĚŘENÁ VEŘEJNÁ KOPIE PDF", warning), Paragraph("Tato veřejná kopie byla vytvořena z ověřeného textového přepisu listiny. Nejde o byte-identický originální soubor; obsah je publikován pro veřejnou evidenci a čitelnost.", meta), Spacer(1, 4*mm)]
    for raw in read_source_text(source).splitlines():
        if not raw.strip():
            story.append(Spacer(1, 2.2*mm))
        else:
            story.append(Paragraph(html.escape(raw).replace("  ", "&nbsp;&nbsp;"), body))
    doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
    if target.read_bytes()[:5] != b"%PDF-":
        raise SystemExit(f"Generated file is not a PDF: {target}")
    digest = sha256(target)
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    rel = target.relative_to(WEB).as_posix()
    matched = 0
    for record in registry.get("documents", []):
        public = record.get("public") or {}
        if public.get("intended_pdf") == rel:
            public["pdf"] = rel
            public["sha256"] = digest
            public["verification_status"] = "generated_public_copy_from_verified_text; not_byte_identical_original"
            record["public"] = public
            matched += 1
    if matched != 1:
        raise SystemExit(f"Registry patch incomplete for {item['label']}: {matched}/1")
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"GENERATED {item['label']} PDF {rel} {digest}")

def main():
    pdfmetrics.registerFont(TTFont("StateUnicode", str(find_font())))
    styles = getSampleStyleSheet()
    warning = ParagraphStyle("warning", parent=styles["Heading2"], fontName="StateUnicode", fontSize=10, leading=14, alignment=TA_CENTER, spaceAfter=8*mm)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="StateUnicode", fontSize=9.2, leading=12.2, spaceAfter=2.2*mm)
    meta = ParagraphStyle("meta", parent=body, fontSize=8.4, leading=11)
    for item in ITEMS:
        materialize(item, warning, body, meta)

if __name__ == "__main__":
    main()
