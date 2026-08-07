from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "web" / "documents" / "report-07082026-011" / "fulltext"
OUT = ROOT / "web" / "documents" / "report-07082026-011"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
pdfmetrics.registerFont(TTFont("DejaVu", FONT))

DOCS = [
    ("01-euda-request-2026-05-15-en.pdf", ["01-request-en-01.txt"], "EUDA request — 15 May 2026 — English"),
    ("02-euda-correspondence-2026-05-22-to-06-03-en.pdf", ["02-correspondence-en-01.txt"], "EUDA correspondence — May–June 2026 — English"),
    ("03-euda-call-to-act-2026-08-07-cs.pdf", ["03-call-cs-01.txt", "03-call-cs-02.txt"], "Formální výzva EUDA — 7. srpna 2026 — česky"),
    ("04-euda-call-to-act-2026-08-07-en.pdf", ["04-call-en-01.txt", "04-call-en-02.txt", "04-call-en-03.txt"], "Formal Call to Act — EUDA — 7 August 2026 — English"),
]

body = ParagraphStyle(
    "body",
    fontName="DejaVu",
    fontSize=8.5,
    leading=11,
    spaceAfter=1.2 * mm,
    allowWidows=1,
    allowOrphans=1,
)
notice = ParagraphStyle(
    "notice",
    parent=body,
    fontSize=7.5,
    leading=9.5,
    spaceAfter=4 * mm,
)


def load(parts):
    return "\n".join((SRC / p).read_text(encoding="utf-8") for p in parts)


def make_pdf(filename, parts, title):
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / filename
    doc = SimpleDocTemplate(
        str(target),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
        author="Mgr. Dušan Dvořák / Cannabis is The Cure, z. s.",
        subject="Public documentary copy generated from the full text supplied for report 07082026-011",
    )
    story = [
        Paragraph(escape(title), body),
        Paragraph(
            "Veřejná textová reprodukce dokumentu pro CannaInsider.EU. Obsah vychází z plného textu zdrojového PDF poskytnutého pro report 07082026-011; grafická podoba původního PDF není reprodukována.",
            notice,
        ),
    ]
    for line in load(parts).splitlines():
        if line.strip() == "--- DALŠÍ STRANA ---":
            story.append(PageBreak())
        elif not line.strip():
            story.append(Spacer(1, 1.5 * mm))
        else:
            story.append(Paragraph(escape(line).replace("  ", "&nbsp; "), body))
    doc.build(story)
    print(target.relative_to(ROOT))


for filename, parts, title in DOCS:
    make_pdf(filename, parts, title)
