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
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, PageBreak

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-03-four-records.json"

SPECS = [
    {
        "id": "doc-cz-ks-brn-2026-09-03-9-to-315-2026-140",
        "source": ROOT / "project-memory/user-text-sources-2026-10-03/ks-brno-9-to-315-2026-140.txt",
        "target": WEB / "documents/report-04082026-010/110-ks-brno-9-to-315-2026-140-2026-09-03-verejna-textova-kopie.pdf",
        "original_sha": "e565b7e3bb122f00ff04720f1acce031525c1b9c2a2457a87cdac96055ec64a6",
        "title": "KS Brno 9 To 315/2026-140 – veřejná textová kopie rozhodných částí",
        "copy_note": "Veřejná textová kopie rozhodných částí pětistránkového skenu; nereprodukuje grafickou podobu originálu.",
    },
    {
        "id": "doc-cz-ekk-2026-10-02-os-praha10-ftv-prima-doplneni-zaloby",
        "source": ROOT / "project-memory/user-text-sources-2026-10-03/os-praha10-ftv-prima-doplneni.txt",
        "target": WEB / "documents/justice-slalom/2026-10/092-podani-2026-10-02-verejna-textova-kopie.pdf",
        "original_sha": "483f849dbe816df2bfaac7b8d7a5b7be2dc2a796b711c7aec9c880fc34f6a457",
        "title": "EKK – doplnění a zpřesnění žaloby FTV Prima – 2. 10. 2026",
        "copy_note": "Veřejná textová kopie z kompletního extrahovaného textu uživatelem nahraného PDF; není byte-identická s originálem.",
    },
    {
        "id": "doc-cz-ms-pha-2026-10-02-18-a-17-2026-191",
        "source": ROOT / "project-memory/user-text-sources-2026-10-03/ms-praha-18-a-17-2026-191.txt",
        "target": WEB / "documents/report-04082026-010/111-ms-praha-18-a-17-2026-191-2026-10-02-verejna-textova-kopie.pdf",
        "original_sha": "394d9db7e01099561138c77382e162b59810a4fdb77f1114b471fdc2e336f293",
        "title": "MS Praha 18 A 17/2026-191 – 2. 10. 2026",
        "copy_note": "Veřejná textová kopie z kompletního extrahovaného textu uživatelem nahraného PDF; není byte-identická s originálem.",
    },
    {
        "id": "doc-cz-dd-2026-10-04-ncoz-ms-pha-18-a-17-reakce",
        "source": ROOT / "project-memory/user-text-sources-2026-10-03/ncoz-ms-praha-18-a-17-reakce-2026-10-04.txt",
        "target": WEB / "documents/justice-slalom/2026-10/093-podani-2026-10-04-verejna-textova-kopie.pdf",
        "original_sha": "3dd1854522b5bcb9d0f87f9d14f199881915e80bc91a9850a04ac404f33981a2",
        "title": "18 A 17/2026 – reakce žalobce – listina datovaná 4. 10. 2026",
        "copy_note": "Veřejná textová kopie z kompletního extrahovaného textu uživatelem nahraného PDF; není byte-identická s originálem.",
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

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("FourRecordsUnicode", 6.5)
    canvas.drawCentredString(A4[0] / 2, 8 * mm, f"strana {doc.page}")
    canvas.restoreState()

def build(spec, font_path):
    source = spec["source"].read_text("utf-8").strip()
    if len(source) < 300:
        raise SystemExit(f"Source text too short: {spec['id']}")
    if "FourRecordsUnicode" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("FourRecordsUnicode", str(font_path)))

    target = spec["target"]
    target.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title", parent=styles["Heading1"], fontName="FourRecordsUnicode", fontSize=11.5, leading=14, spaceAfter=4*mm)
    meta = ParagraphStyle("meta", parent=styles["BodyText"], fontName="FourRecordsUnicode", fontSize=6.8, leading=8.6, spaceAfter=3*mm)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="FourRecordsUnicode", fontSize=8.0, leading=10.3, spaceAfter=1.4*mm)

    doc = SimpleDocTemplate(
        str(target), pagesize=A4, leftMargin=15*mm, rightMargin=15*mm,
        topMargin=14*mm, bottomMargin=14*mm, title=spec["title"],
        author="Evidence Lab – verified public text copy", invariant=1
    )
    story = [
        Paragraph(html.escape(spec["title"]), title),
        Paragraph(html.escape(spec["copy_note"]), meta),
        Paragraph("Originální zdrojový SHA-256: " + spec["original_sha"], meta),
        Spacer(1, 2*mm),
    ]
    for raw in source.splitlines():
        line = raw.strip()
        if not line:
            story.append(Spacer(1, 1.4*mm))
            continue
        story.append(Paragraph(html.escape(line), body))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    data = target.read_bytes()
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:] or len(data) < 4000:
        raise SystemExit(f"Invalid generated PDF: {target}")
    return digest(target)

def main():
    font_path = find_font()
    registry = json.loads(REGISTRY.read_text("utf-8"))
    docs = {d["id"]: d for d in registry.get("documents", [])}
    for spec in SPECS:
        item = docs.get(spec["id"])
        if not item:
            raise SystemExit("Missing registry item " + spec["id"])
        if item["public"].get("source_original_sha256") != spec["original_sha"]:
            raise SystemExit("Original source SHA mismatch for " + spec["id"])
        sha = build(spec, font_path)
        rel = spec["target"].relative_to(WEB).as_posix()
        if item["public"].get("intended_pdf") != rel:
            raise SystemExit("Public target mismatch for " + spec["id"])
        item["public"]["pdf"] = rel
        item["public"]["sha256"] = sha
        item["public"]["verification_status"] = (
            "verified_deterministic_public_text_copy; "
            "not_byte_identical_original; source_original_sha256=" + spec["original_sha"]
        )
        if item.get("justice_slalom"):
            item["justice_slalom"]["public_sha256"] = sha
        print("GENERATED", spec["id"], rel, sha)
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")

if __name__ == "__main__":
    main()
