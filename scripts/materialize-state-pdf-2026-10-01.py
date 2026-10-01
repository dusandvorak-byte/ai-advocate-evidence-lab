#!/usr/bin/env python3
from __future__ import annotations
import hashlib, html, json
from pathlib import Path
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
SOURCE=ROOT/"project-memory/state-text-sources-2026-10-01/105-msz-praha-3-kzn-974-2026-114-2026-10-01.txt"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-01-msz-114.json"
TARGET=WEB/"documents/report-04082026-010/105-msz-praha-3-kzn-974-2026-114-2026-10-01-verejna-kopie.pdf"
FONT_CANDIDATES=[Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),Path("/usr/share/fonts/dejavu/DejaVuSans.ttf")]

def font():
    for p in FONT_CANDIDATES:
        if p.exists(): return p
    raise SystemExit("Unicode font not found")
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def footer(canvas,doc):
    canvas.saveState(); canvas.setFont("StateUnicode",8); canvas.drawCentredString(A4[0]/2,10*mm,f"Strana {doc.page}"); canvas.restoreState()

pdfmetrics.registerFont(TTFont("StateUnicode",str(font())))
text=SOURCE.read_text(encoding="utf-8").strip()
styles=getSampleStyleSheet()
warning=ParagraphStyle("warning",parent=styles["Heading2"],fontName="StateUnicode",fontSize=10,leading=14,alignment=TA_CENTER,spaceAfter=7*mm)
body=ParagraphStyle("body",parent=styles["BodyText"],fontName="StateUnicode",fontSize=9.2,leading=12.2,spaceAfter=2.1*mm)
meta=ParagraphStyle("meta",parent=body,fontSize=8.4,leading=11)
TARGET.parent.mkdir(parents=True,exist_ok=True)
doc=SimpleDocTemplate(str(TARGET),pagesize=A4,rightMargin=18*mm,leftMargin=18*mm,topMargin=17*mm,bottomMargin=18*mm,title=TARGET.stem,author="Evidence Lab / ověřená veřejná kopie z textového přepisu")
story=[Paragraph("OVĚŘENÁ VEŘEJNÁ KOPIE PDF",warning),Paragraph("Tato veřejná kopie byla vytvořena z ověřeného textového přepisu nahrané úřední listiny. Nejde o byte-identický originální PDF soubor a nereprodukuje jeho elektronický podpis ani původní metadata.",meta),Spacer(1,4*mm)]
for raw in text.splitlines():
    line=raw.rstrip()
    if not line: story.append(Spacer(1,2*mm)); continue
    story.append(Paragraph(html.escape(line).replace("  ","&nbsp;&nbsp;"),body))
doc.build(story,onFirstPage=footer,onLaterPages=footer)
b=TARGET.read_bytes()
if b[:5]!=b"%PDF-" or b"%%EOF" not in b[-2048:]: raise SystemExit("Generated PDF integrity failure")
sha=digest(TARGET)
registry=json.loads(REGISTRY.read_text(encoding="utf-8"))
item=next((x for x in registry["documents"] if x["id"]=="doc-cz-msz-pha-2026-10-01-3-kzn-974-2026-114"),None)
if not item: raise SystemExit("Registry item missing")
item["public"]["pdf"]="documents/report-04082026-010/105-msz-praha-3-kzn-974-2026-114-2026-10-01-verejna-kopie.pdf"
item["public"]["sha256"]=sha
item["public"]["verification_status"]="generated_public_copy_from_verified_text; not_byte_identical_original"
REGISTRY.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"GENERATED 2026-10-01 STATE PDF documents/report-04082026-010/105-msz-praha-3-kzn-974-2026-114-2026-10-01-verejna-kopie.pdf {sha}")
