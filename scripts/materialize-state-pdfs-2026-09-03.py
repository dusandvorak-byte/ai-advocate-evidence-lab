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
REGISTRY = ROOT / "project-memory" / "documents-2026-supplement-2026-09-03-kpr-osz-fm.json"
MANIFEST = WEB / "data" / "generated-state-pdf-manifest-2026-09-03.json"

SOURCES = {
    "kpr-5080-2026-vyrizeni-stiznosti-2026-09-02-verejna-kopie.pdf": ROOT / "project-memory/state-text-sources-2026-09-03/kpr-5080-2026-2026-09-02.txt",
    "osz-fm-1-zn-7061-2026-79-2026-09-03-verejna-kopie.pdf": ROOT / "project-memory/state-text-sources-2026-09-03/osz-fm-1-zn-7061-2026-79-2026-09-03.txt",
}

FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
]


def find_font() -> Path:
    for path in FONT_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("Unicode font not found")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("StateUnicode", 8)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Strana {doc.page}")
    canvas.restoreState()


def make_pdf(target: Path, source: Path):
    if not source.exists():
        raise SystemExit(f"Missing verified text source: {source}")
    text = source.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit(f"Empty verified text source: {source}")

    styles = getSampleStyleSheet()
    warning = ParagraphStyle(
        "warning", parent=styles["Heading2"], fontName="StateUnicode",
        fontSize=10, leading=14, alignment=TA_CENTER, spaceAfter=7 * mm,
    )
    body = ParagraphStyle(
        "body", parent=styles["BodyText"], fontName="StateUnicode",
        fontSize=9.2, leading=12.2, spaceAfter=2.1 * mm,
    )
    meta = ParagraphStyle("meta", parent=body, fontSize=8.4, leading=11)

    target.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(target), pagesize=A4,
        rightMargin=18 * mm, leftMargin=18 * mm, topMargin=17 * mm, bottomMargin=18 * mm,
        title=target.stem,
        author="Evidence Lab / ověřená veřejná kopie z textového přepisu",
    )
    story = [
        Paragraph("OVĚŘENÁ VEŘEJNÁ KOPIE PDF", warning),
        Paragraph(
            "Tato veřejná kopie byla vytvořena z ověřeného textového přepisu nahrané úřední listiny. "
            "Nejde o byte-identický originální PDF soubor a nereprodukuje jeho elektronický podpis ani původní metadata.",
            meta,
        ),
        Spacer(1, 4 * mm),
    ]
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line:
            story.append(Spacer(1, 2 * mm))
            continue
        story.append(Paragraph(html.escape(line).replace("  ", "&nbsp;&nbsp;"), body))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    if target.read_bytes()[:5] != b"%PDF-":
        raise SystemExit(f"Generated file is not PDF: {target}")


def main():
    pdfmetrics.registerFont(TTFont("StateUnicode", str(find_font())))
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)

    generated = {}
    records = []
    for filename, source in SOURCES.items():
        target = OUT / filename
        make_pdf(target, source)
        digest = sha256(target)
        rel = target.relative_to(WEB).as_posix()
        generated[rel] = digest
        records.append({
            "path": rel,
            "sha256": digest,
            "kind": "generated_public_copy_from_verified_text",
            "byte_identical_original": False,
            "source": source.relative_to(ROOT).as_posix(),
        })
        print(f"GENERATED 2026-09-03 STATE PDF {rel} {digest}")

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    patched = 0
    for item in registry.get("documents", []):
        public = item.get("public") or {}
        intended = public.get("intended_pdf")
        if intended in generated:
            public["pdf"] = intended
            public["sha256"] = generated[intended]
            public["verification_status"] = "generated_public_copy_from_verified_text; not_byte_identical_original"
            item["public"] = public
            patched += 1
    if patched != len(SOURCES):
        raise SystemExit(f"Registry patch incomplete: {patched}/{len(SOURCES)}")
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    MANIFEST.write_text(json.dumps({
        "schema_version": "1.0",
        "notice": "Generated public PDF copies from verified text; not byte-identical originals.",
        "count": len(records),
        "records": records,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"LATEST STATE PDF MATERIALIZATION COMPLETE {len(records)}/{len(SOURCES)}")


if __name__ == "__main__":
    main()
