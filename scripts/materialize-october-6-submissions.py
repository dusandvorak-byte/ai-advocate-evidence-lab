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
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-06-cnb-ms-praha.json"

SPECS = [
    {
        "id": "doc-cz-ekk-2026-10-06-cnb-rb-aml-podnet",
        "source": ROOT / "project-memory/user-text-sources-2026-10-06/cnb-rb-2026-10-06.txt",
        "target": WEB / "documents/justice-slalom/2026-10/097-podani-2026-10-06-cnb-raiffeisenbank-verejna-kopie.pdf",
        "title": "Edukativní konopná klinika - podnět ČNB a Ombudsmanovi Raiffeisenbank - 6. 10. 2026",
        "note": "Veřejná textová kopie z úplného textu podání. Soukromé kontaktní údaje a jméno jiné fyzické osoby byly v této veřejné kopii omezeny. Kopie není byte-identická s původním PDF.",
    },
    {
        "id": "doc-cz-dd-2026-10-06-ms-praha-18a17-18a23-dukazni-doplneni",
        "source": ROOT / "project-memory/user-text-sources-2026-10-06/ms-praha-18a17-18a23-2026-10-06.txt",
        "target": WEB / "documents/justice-slalom/2026-10/098-podani-2026-10-06-ms-praha-18a17-18a23-verejna-kopie.pdf",
        "title": "Městský soud v Praze - společné důkazní doplnění 18 A 17/2026 a 18 A 23/2026 - 6. 10. 2026",
        "note": "Veřejná textová kopie z úplného věcného textu podání. Datum narození a soukromá adresa žalobce byly ve veřejné kopii vypuštěny. Kopie není byte-identická s původním PDF.",
    },
]

FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
]

def find_font() -> Path:
    for candidate in FONT_CANDIDATES:
        if candidate.exists():
            return candidate
    raise SystemExit("Unicode font not found")

def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def digest(path: Path) -> str:
    return digest_bytes(path.read_bytes())

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Oct6Unicode", 6.5)
    canvas.drawCentredString(A4[0] / 2, 8 * mm, f"strana {doc.page}")
    canvas.restoreState()

def build_copy(spec: dict, font_path: Path) -> tuple[str, str]:
    source = spec["source"].read_text("utf-8").strip()
    if len(source) < 500:
        raise SystemExit(f"Source text too short: {spec['id']}")
    if "Oct6Unicode" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Oct6Unicode", str(font_path)))
    target = spec["target"]
    target.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title", parent=styles["Heading1"], fontName="Oct6Unicode", fontSize=11.2, leading=13.5, spaceAfter=4*mm)
    meta = ParagraphStyle("meta", parent=styles["BodyText"], fontName="Oct6Unicode", fontSize=6.8, leading=8.6, spaceAfter=3*mm)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Oct6Unicode", fontSize=7.8, leading=10.1, spaceAfter=1.2*mm)
    text_sha = digest(spec["source"])

    def render():
        doc = SimpleDocTemplate(
            str(target), pagesize=A4, leftMargin=15*mm, rightMargin=15*mm,
            topMargin=14*mm, bottomMargin=14*mm, title=spec["title"],
            author="Evidence Lab - verified public text copy", invariant=1,
        )
        story = [
            Paragraph(html.escape(spec["title"]), title),
            Paragraph(html.escape(spec["note"]), meta),
            Paragraph("SHA-256 veřejného textového zdroje: " + text_sha, meta),
            Spacer(1, 2*mm),
        ]
        for raw in source.splitlines():
            line = raw.strip()
            story.append(Spacer(1, 1.2*mm) if not line else Paragraph(html.escape(line), body))
        doc.build(story, onFirstPage=footer, onLaterPages=footer)
        data = target.read_bytes()
        if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:] or len(data) < 4000:
            raise SystemExit(f"Invalid generated PDF: {target}")
        return digest_bytes(data)

    first = render()
    second = render()
    if first != second:
        raise SystemExit(f"Non-deterministic PDF materialization: {spec['id']}")
    return second, text_sha

def main():
    font_path = find_font()
    registry = json.loads(REGISTRY.read_text("utf-8"))
    docs = {item["id"]: item for item in registry.get("documents", [])}
    for spec in SPECS:
        item = docs.get(spec["id"])
        if not item:
            raise SystemExit("Missing registry item " + spec["id"])
        pdf_sha, text_sha = build_copy(spec, font_path)
        rel = spec["target"].relative_to(WEB).as_posix()
        item["public"]["pdf"] = rel
        item["public"]["sha256"] = pdf_sha
        item["public"]["source_text_sha256"] = text_sha
        item["public"]["verification_status"] = "verified_deterministic_redacted_public_text_copy; not_byte_identical_original"
        item["justice_slalom"]["public_sha256"] = pdf_sha
        item["justice_slalom"]["source_text_sha256"] = text_sha
        print("GENERATED PUBLIC COPY", spec["id"], rel, pdf_sha)
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")

if __name__ == "__main__":
    main()
