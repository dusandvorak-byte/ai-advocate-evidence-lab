#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-07-two-state-responses.json"

SPECS = [
    {
        "id": "doc-cz-ksz-brn-2026-10-01-1-kzn-1079-2026-41",
        "source": ROOT / "project-memory/state-text-sources-2026-10-07/ksz-brno-1-kzn-1079-2026-41.txt",
        "target": WEB / "documents/report-04082026-010/113-ksz-brno-1-kzn-1079-2026-41-2026-10-01-verejna-textova-kopie.pdf",
        "original_sha": "f21487295ab845769b9e4a610c7d5fce4f9e7446c3cdc42af8094cf81bdd9f4e",
        "pages": 3,
        "title": "KSZ v Brně – 1 KZN 1079/2026-41 – 1. 10. 2026",
    },
    {
        "id": "doc-cz-pcr-pp-2026-10-07-ppr-52605-2-cj-2026-990210-pd",
        "source": ROOT / "project-memory/state-text-sources-2026-10-07/ppr-52605-2-cj-2026-990210-pd.txt",
        "target": WEB / "documents/report-04082026-010/114-ppr-52605-2-cj-2026-990210-pd-2026-10-07-verejna-textova-kopie.pdf",
        "original_sha": "796deaddb0723757a023dd27d2f88fc97ef525a7a653ebad1da15c4ee38f2c68",
        "pages": 2,
        "title": "Policejní prezidium – PPR-52605-2/ČJ-2026-990210-PD – 7. 10. 2026",
    },
]

FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
]
FONT_NAME = "StateResponsesOct7Unicode"

def find_font() -> Path:
    for path in FONT_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("Unicode font not found")

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT_NAME, 6.5)
    canvas.drawCentredString(A4[0] / 2, 8 * mm, f"strana {doc.page}")
    canvas.restoreState()

def render(spec: dict, font_path: Path) -> bytes:
    source = spec["source"].read_text("utf-8").strip()
    if len(source) < 500:
        raise SystemExit(f"Source text too short: {spec['id']}")
    if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(font_path)))

    target = spec["target"]
    target.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "oct7-title", parent=styles["Heading1"], fontName=FONT_NAME,
        fontSize=11.5, leading=14, spaceAfter=4 * mm,
    )
    meta_style = ParagraphStyle(
        "oct7-meta", parent=styles["BodyText"], fontName=FONT_NAME,
        fontSize=6.8, leading=8.6, spaceAfter=2.5 * mm,
    )
    body_style = ParagraphStyle(
        "oct7-body", parent=styles["BodyText"], fontName=FONT_NAME,
        fontSize=8.0, leading=10.3, spaceAfter=1.3 * mm,
    )

    doc = SimpleDocTemplate(
        str(target), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm, title=spec["title"],
        author="Evidence Lab – ověřená deterministická veřejná textová kopie",
        invariant=1,
    )
    story = [
        Paragraph(html.escape(spec["title"]), title_style),
        Paragraph(
            "OVĚŘENÁ DETERMINISTICKÁ VEŘEJNÁ TEXTOVÁ KOPIE. "
            "Byla vytvořena z úplného extrahovaného textu uživatelem nahraného PDF. "
            "Není byte-identická s originálem a nereprodukuje jeho grafickou úpravu, elektronický podpis ani metadata.",
            meta_style,
        ),
        Paragraph("SHA-256 nahraného originálu: " + spec["original_sha"], meta_style),
        Spacer(1, 2 * mm),
    ]
    for raw in source.splitlines():
        line = raw.strip()
        story.append(Spacer(1, 1.4 * mm) if not line else Paragraph(html.escape(line), body_style))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    data = target.read_bytes()
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:] or len(data) < 4000:
        raise SystemExit(f"Invalid generated PDF: {target}")
    return data

def main() -> None:
    font_path = find_font()
    registry = json.loads(REGISTRY.read_text("utf-8"))
    docs = {item["id"]: item for item in registry.get("documents", [])}
    if set(docs) != {spec["id"] for spec in SPECS}:
        raise SystemExit("Registry/spec ID mismatch")

    for spec in SPECS:
        item = docs[spec["id"]]
        public = item.setdefault("public", {})
        if public.get("source_original_sha256") != spec["original_sha"]:
            raise SystemExit("Original provenance mismatch: " + spec["id"])
        rel = spec["target"].relative_to(WEB).as_posix()
        if public.get("intended_pdf") != rel:
            raise SystemExit(f"intended_pdf mismatch for {spec['id']}")

        first = render(spec, font_path)
        first_sha = sha256_bytes(first)
        second = render(spec, font_path)
        second_sha = sha256_bytes(second)
        if first != second or first_sha != second_sha:
            raise SystemExit(f"Non-deterministic public copy: {spec['id']}")

        public["pdf"] = rel
        public["sha256"] = second_sha
        public["verification_status"] = (
            "verified_deterministic_public_text_copy; not_byte_identical_original; "
            "complete_extracted_text; source_original_sha256=" + spec["original_sha"]
        )
        public["source_original_page_count"] = spec["pages"]
        print("GENERATED DETERMINISTIC PUBLIC COPY", spec["id"], rel, second_sha)

    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")

if __name__ == "__main__":
    main()
