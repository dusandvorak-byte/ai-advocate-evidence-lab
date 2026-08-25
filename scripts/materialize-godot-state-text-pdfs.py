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
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT = WEB / "documents" / "report-04082026-010"
REGISTRY = ROOT / "project-memory" / "documents-2026-supplement-2026-08-20-24.json"
MANIFEST = WEB / "data" / "generated-state-pdf-manifest.json"

SOURCES = {
    "64-msz-praha-2-kzn-55-2025-136-2026-08-20.pdf": [
        ROOT / "project-memory/state-text-sources-2026-08-25/64-00.txt",
        ROOT / "project-memory/state-text-sources-2026-08-25/64-01.txt",
    ],
    "65-ku-4139-12-cj-2026-2305km-2026-08-20.pdf": [
        ROOT / "project-memory/state-text-sources-2026-08-25/65-00.txt",
    ],
    "66-krpt-203594-7-cj-2026-0700kr-2026-08-20.pdf": [
        ROOT / "project-memory/state-text-sources-2026-08-25/66-00.txt",
    ],
    "67-krpt-priloha-rr-ku-54-2021.pdf": [
        ROOT / "project-memory/state-text-sources-2026-08-25/67-00.txt",
    ],
    "68-krpt-priloha-rr-ku-54-2021-priloha-1.pdf": [
        ROOT / "project-memory/state-text-sources-2026-08-25/68-00.txt",
    ],
    "69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf": [
        ROOT / "project-memory/state-extracted-2026-08-25/69.txt",
    ],
    "70-krpt-203594-8-cj-2026-0700kr-2026-08-20.pdf": [
        ROOT / "project-memory/state-extracted-2026-08-25/70.txt",
    ],
    "71-ppr-44020-2-cj-2026-990210-pd-2026-08-24.pdf": [
        ROOT / "project-memory/state-extracted-2026-08-25/71.txt",
    ],
}

FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
]


def find_font() -> Path:
    for p in FONT_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("Unicode font not found; expected DejaVu Sans or Arial Unicode")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("StateUnicode", 8)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Strana {doc.page}")
    canvas.restoreState()


def make_pdf(target: Path, source_paths: list[Path]):
    missing = [str(p) for p in source_paths if not p.exists()]
    if missing:
        raise SystemExit("Missing verified text source(s): " + ", ".join(missing))

    source_text = "\n\n".join(p.read_text(encoding="utf-8") for p in source_paths).strip()
    if not source_text:
        raise SystemExit(f"Verified text source is empty for {target.name}")

    styles = getSampleStyleSheet()
    warning = ParagraphStyle(
        "warning",
        parent=styles["Heading2"],
        fontName="StateUnicode",
        fontSize=10,
        leading=14,
        alignment=TA_CENTER,
        spaceAfter=8 * mm,
    )
    body = ParagraphStyle(
        "body",
        parent=styles["BodyText"],
        fontName="StateUnicode",
        fontSize=9.2,
        leading=12.2,
        spaceAfter=2.2 * mm,
    )
    meta = ParagraphStyle(
        "meta",
        parent=body,
        fontSize=8.4,
        leading=11,
    )

    target.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(target),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=17 * mm,
        bottomMargin=18 * mm,
        title=target.stem,
        author="Evidence Lab / veřejná kopie z ověřeného textového přepisu",
    )

    story = [
        Paragraph("OVĚŘENÁ VEŘEJNÁ KOPIE PDF", warning),
        Paragraph(
            "Tato veřejná kopie byla vytvořena z ověřeného textového přepisu listiny. "
            "Nejde o byte-identický originální soubor; obsah je publikován pro veřejnou evidenci a čitelnost.",
            meta,
        ),
        Spacer(1, 4 * mm),
    ]

    for raw in source_text.splitlines():
        line = raw.rstrip()
        if not line:
            story.append(Spacer(1, 2.2 * mm))
            continue
        safe = html.escape(line).replace("  ", "&nbsp;&nbsp;")
        story.append(Paragraph(safe, body))

    doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
    if target.read_bytes()[:5] != b"%PDF-":
        raise SystemExit(f"Generated file is not a PDF: {target}")


def main():
    font = find_font()
    pdfmetrics.registerFont(TTFont("StateUnicode", str(font)))
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)

    records = []
    generated = {}
    for filename, source_paths in SOURCES.items():
        target = OUT / filename
        make_pdf(target, source_paths)
        digest = sha256(target)
        rel = target.relative_to(WEB).as_posix()
        generated[rel] = digest
        records.append({
            "path": rel,
            "sha256": digest,
            "kind": "generated_public_copy_from_verified_text",
            "byte_identical_original": False,
            "sources": [p.relative_to(ROOT).as_posix() for p in source_paths],
        })
        print(f"GENERATED STATE PDF {rel} {digest}")

    if not REGISTRY.exists():
        raise SystemExit(f"Missing registry {REGISTRY}")
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
        raise SystemExit(f"Registry patch incomplete: {patched}/{len(SOURCES)} state PDFs matched")
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    MANIFEST.write_text(json.dumps({
        "schema_version": "1.0",
        "notice": "Generated public PDF copies from verified text transcriptions; not byte-identical originals.",
        "count": len(records),
        "records": records,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"STATE TEXT PDF MATERIALIZATION COMPLETE {len(records)}/{len(SOURCES)}")


if __name__ == "__main__":
    main()
