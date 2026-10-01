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
SOURCE = ROOT / "project-memory/user-text-sources-2026-10-02/uoou-stiznost-necinnost.txt"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-02-uoou-necinnost.json"
TARGET = WEB / "documents/justice-slalom/2026-10/089-podani-2026-10-02.pdf"
ORIGINAL_SHA256 = "37791bd52b5237313dc7bc58a9fc2515689f3038cf3f42ef368836012e59da74"
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
    return hashlib.sha256(path.read_bytes()).hexdigest()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("SubmissionUnicode", 8)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"Strana {doc.page}")
    canvas.restoreState()

pdfmetrics.registerFont(TTFont("SubmissionUnicode", str(find_font())))
text = SOURCE.read_text(encoding="utf-8").strip()
if not text or "STÍŽNOST NA NEČINNOST ÚŘADU PRO OCHRANU OSOBNÍCH ÚDAJŮ" not in text:
    raise SystemExit("Verified text source missing or incomplete")

styles = getSampleStyleSheet()
warning = ParagraphStyle(
    "warning", parent=styles["Heading2"], fontName="SubmissionUnicode",
    fontSize=10.5, leading=14, alignment=TA_CENTER, spaceAfter=5 * mm,
)
meta = ParagraphStyle(
    "meta", parent=styles["BodyText"], fontName="SubmissionUnicode",
    fontSize=8.3, leading=11, spaceAfter=5 * mm,
)
body = ParagraphStyle(
    "body", parent=styles["BodyText"], fontName="SubmissionUnicode",
    fontSize=9.0, leading=12.0, spaceAfter=1.8 * mm,
)
heading = ParagraphStyle(
    "heading", parent=body, fontSize=10.2, leading=13.2, spaceBefore=2.8 * mm,
    spaceAfter=2.0 * mm,
)

TARGET.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(
    str(TARGET), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
    topMargin=17 * mm, bottomMargin=18 * mm,
    title="ÚOOÚ – stížnost na nečinnost – 2. října 2026",
    author="Mgr. Dušan Dvořák / Evidence Lab – veřejná kopie",
)
story = [
    Paragraph("OVĚŘENÁ VEŘEJNÁ KOPIE PDF", warning),
    Paragraph(
        "Tato veřejná kopie byla vytvořena z úplného textového přepisu uživatelem nahraného čtyřstránkového PDF. "
        f"Binární originál má SHA-256 {ORIGINAL_SHA256}. Tato kopie není byte-identickým originálem; rozhodující je původní nahraná listina.",
        meta,
    ),
]
for raw in text.splitlines():
    line = raw.strip()
    if not line:
        story.append(Spacer(1, 1.8 * mm))
        continue
    style = heading if (
        line.startswith(("I. ", "II. ", "III. ", "IV. ", "V. ", "VI. "))
        or line in {"TŘI SAMOSTATNÉ VĚTVE NEČINNOSTI", "ČASOVÝ LIMIT PODLE ČL. 78 ODST. 2 GDPR", "Důkazní podklady"}
        or line.startswith("STÍŽNOST NA NEČINNOST")
    ) else body
    story.append(Paragraph(html.escape(line), style))

doc.build(story, onFirstPage=footer, onLaterPages=footer)
data = TARGET.read_bytes()
if data[:5] != b"%PDF-" or b"%%EOF" not in data[-2048:] or len(data) < 5000:
    raise SystemExit("Generated public-copy PDF integrity failure")
public_sha = sha256(TARGET)

registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
item = next((x for x in registry["documents"] if x["id"] == "doc-cz-dd-2026-10-02-uoou-stiznost-necinnost"), None)
if not item:
    raise SystemExit("ÚOOÚ submission registry item missing")
item["public"]["pdf"] = "documents/justice-slalom/2026-10/089-podani-2026-10-02.pdf"
item["public"]["sha256"] = public_sha
item["public"]["verification_status"] = (
    "verified_public_copy_from_complete_text_of_uploaded_original; "
    f"original_sha256={ORIGINAL_SHA256}; not_byte_identical_original"
)
meta_slalom = item["justice_slalom"]
meta_slalom["source_sha256"] = ORIGINAL_SHA256
meta_slalom["source_kind"] = "verified_public_copy_from_user_original"
meta_slalom["public_sha256"] = public_sha
meta_slalom["public_copy_manifest"] = {
    "kind": "complete_text_public_copy",
    "source_text": "project-memory/user-text-sources-2026-10-02/uoou-stiznost-necinnost.txt",
    "original_pages_reviewed": 4,
    "original_sha256": ORIGINAL_SHA256,
    "byte_identical_original": False
}
REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"GENERATED UOOU 2026-10-02 PUBLIC COPY {TARGET.relative_to(WEB).as_posix()} {public_sha}")
