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

ITEMS = [
    {
        "filename": "72-md-46042-2026-010-4-2026-08-18.pdf",
        "source": ROOT / "project-memory/state-text-sources-2026-08-25/72-md-46042-2026-010-4.txt",
        "registry": ROOT / "project-memory/documents-2026-supplement-2026-08-18-md.json",
        "id": "doc-cz-md-2026-08-18-md-46042-2026-010-4",
    },
    {
        "filename": "73-msz-praha-2-kzn-683-2026-31-2026-08-24.pdf",
        "source": ROOT / "project-memory/state-text-sources-2026-08-25/73-msz-praha-2-kzn-683-2026-31.txt",
        "registry": ROOT / "project-memory/documents-2026-supplement-2026-08-24-msz-683.json",
        "id": "doc-cz-msz-pha-2026-08-24-2-kzn-683-2026-31",
    },
    {
        "filename": "74-ms-praha-15-a-44-2026-43-2026-08-25.pdf",
        "source": ROOT / "project-memory/state-text-sources-2026-08-25/74-ms-praha-15-a-44-2026-43.txt",
        "registry": ROOT / "project-memory/documents-2026-supplement-2026-08-25-courts.json",
        "id": "doc-cz-ms-pha-2026-08-25-15-a-44-2026-43",
    },
    {
        "filename": "75-os-prostejov-15-nt-3106-2026-predvolani-2026-08-25.pdf",
        "source": ROOT / "project-memory/state-text-sources-2026-08-25/75-os-prostejov-15-nt-3106-2026-predvolani.txt",
        "registry": ROOT / "project-memory/documents-2026-supplement-2026-08-25-courts.json",
        "id": "doc-cz-os-pro-2026-08-25-15-nt-3106-2026-predvolani",
    },
    {
        "filename": "76-os-prostejov-15-nt-3106-2026-neslouceni-2026-08-25.pdf",
        "source": ROOT / "project-memory/state-text-sources-2026-08-25/76-os-prostejov-15-nt-3106-2026-neslouceni.txt",
        "registry": ROOT / "project-memory/documents-2026-supplement-2026-08-25-courts.json",
        "id": "doc-cz-os-pro-2026-08-25-15-nt-3106-2026-neslouceni",
    },
]

FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
]


def find_font():
    for p in FONT_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("Unicode font not found")


def sha256(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("LateStateUnicode", 8)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Strana {doc.page}")
    canvas.restoreState()


def make_pdf(target: Path, source: Path):
    text = source.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit(f"Empty source: {source}")
    styles = getSampleStyleSheet()
    warning = ParagraphStyle("warning", parent=styles["Heading2"], fontName="LateStateUnicode", fontSize=10, leading=14, alignment=TA_CENTER, spaceAfter=8*mm)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="LateStateUnicode", fontSize=9.2, leading=12.2, spaceAfter=2.2*mm)
    meta = ParagraphStyle("meta", parent=body, fontSize=8.4, leading=11)
    target.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=17*mm, bottomMargin=18*mm, title=target.stem, author="Evidence Lab / veřejná kopie z ověřeného textového přepisu")
    story = [
        Paragraph("OVĚŘENÁ VEŘEJNÁ KOPIE PDF", warning),
        Paragraph("Tato veřejná kopie byla vytvořena z ověřeného textového přepisu uživatelem dodané listiny. Nejde o byte-identický originální soubor; originální PDF je identifikováno SHA-256 uvedeným v přepisu.", meta),
        Spacer(1, 4*mm),
    ]
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line:
            story.append(Spacer(1, 2.2*mm))
        else:
            story.append(Paragraph(html.escape(line).replace("  ", "&nbsp;&nbsp;"), body))
    doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
    if target.read_bytes()[:5] != b"%PDF-":
        raise SystemExit(f"Not a PDF: {target}")


def patch_registry(registry_path: Path, doc_id: str, rel: str, digest: str):
    data = json.loads(registry_path.read_text(encoding="utf-8"))
    found = False
    for item in data.get("documents", []):
        if item.get("id") == doc_id:
            public = item.setdefault("public", {})
            public["pdf"] = rel
            public["sha256"] = digest
            public["verification_status"] = "generated_public_copy_from_verified_text; source_original_sha256_recorded; not_byte_identical_original"
            found = True
            break
    if not found:
        raise SystemExit(f"Document {doc_id} not found in {registry_path}")
    registry_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    pdfmetrics.registerFont(TTFont("LateStateUnicode", str(find_font())))
    for item in ITEMS:
        target = OUT / item["filename"]
        make_pdf(target, item["source"])
        digest = sha256(target)
        rel = target.relative_to(WEB).as_posix()
        patch_registry(item["registry"], item["id"], rel, digest)
        print(f"GENERATED LATE STATE PDF {rel} {digest}")
    print(f"LATE STATE PDF MATERIALIZATION COMPLETE {len(ITEMS)}/{len(ITEMS)}")


if __name__ == "__main__":
    main()
