#!/usr/bin/env python3
"""Deterministic public full-text copy of the 19 October 2026 EUDA letter.

The authenticated original two-page PDF is user-provided outside GitHub;
this text copy does not transport its digital signature or private contacts.
"""
from __future__ import annotations
import hashlib
import html
import json
from io import BytesIO
from pathlib import Path

import fitz
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.pdfgen import canvas as pdfcanvas

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"project-memory/euda-letter-2026-10-19-complete-public-text.txt"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-19-euda-reply.json"
TARGET=ROOT/"web/documents/report-04082026-010/120-euda-exo-fhp-pd-26-d-110-2026-10-19-verejna-textova-kopie.pdf"
ID="doc-eu-euda-2026-10-19-exo-fhp-pd-26-d-110"
FONT="EUDA20261019Unicode"
FONT_PATHS=[
 Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
 Path("/usr/share/fonts/dejavu/DejaVuSans.ttf")
]
def die(s):raise SystemExit("EUDA_D110: "+s)
def render():
 text=SOURCE.read_text("utf-8").strip()
 for required in [
  "EXO/FHP/pd (26) D 110",
  "Your correspondence of 27 September 2026",
  "Nor does the EUDA's publication of national data constitute validation",
  "Article 6(1)(f)",
  "Article 15",
  "Your separate request for access to documents under Regulation (EC) No 1049/2001",
  "Fabian Pereyra",
 ]:
  if required not in text:die("missing original phrase: "+required)
 if "Ospělov 6" in text or "DusanDvorak@seznam.cz" in text:die("private contact found")
 font_path=next((x for x in FONT_PATHS if x.exists()),None)
 if not font_path:die("Unicode TTF not found")
 if FONT not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(FONT,str(font_path)))
 style=ParagraphStyle("Body",fontName=FONT,fontSize=8.3,leading=12.5,spaceAfter=9,wordWrap="LTR")
 note=ParagraphStyle("Note",parent=style,fontSize=7.2,leading=10,textColor="#425769",spaceAfter=12)
 title=ParagraphStyle("Title",parent=style,fontSize=10,leading=15,spaceAfter=11)
 source_page1,source_page2=text.split("[[PAGE_BREAK]]")
 story=[
 Paragraph("EUDA · EXO/FHP/pd (26) D 110 · 19 October 2026",title),
 Paragraph("VEŘEJNÁ TEXTOVÁ KOPIE / PUBLIC TEXT COPY — převzato z úplného věcného textu dvoustránkového originálu. Není totožná s binárním originálem; elektronický podpis není přenesen. Soukromé kontaktní údaje byly vypuštěny.",note),
 ]
 def make_paras(page):
  for p in page.strip().split("\n\n"):
   p=p.strip()
   if p:
    story.append(Paragraph(html.escape(p).replace("\n","<br/>"),style))
 make_paras(source_page1)
 story.append(PageBreak())
 make_paras(source_page2)
 mem=BytesIO()
 doc=SimpleDocTemplate(mem,pagesize=A4,leftMargin=17*mm,rightMargin=17*mm,topMargin=17*mm,bottomMargin=18*mm,title="EUDA EXO/FHP/pd (26) D 110 (text copy)",author="EUDA - public text transcription",pageCompression=1)
 def makecanvas(*args,**kwargs):
  kwargs["invariant"]=1
  return pdfcanvas.Canvas(*args,**kwargs)
 doc.build(story,canvasmaker=makecanvas)
 return mem.getvalue()
first=render()
second=render()
if first!=second:die("non-deterministic PDF")
if not first.startswith(b"%PDF-") or b"%%EOF" not in first[-4096:]:die("invalid PDF")
pdf=fitz.open(stream=first,filetype="pdf")
if pdf.page_count!=2:die(f"expected original 2-page structure; got {pdf.page_count}")
flat=" ".join(" ".join(x.get_text() for x in pdf).split())
for phrase in ["EXO/FHP/pd (26) D 110","Nor does the EUDA","validation by the Agency","Article 15","Fabian Pereyra"]:
 if phrase not in flat:die(f"missing PDF text {phrase}")
pdf.close()
TARGET.parent.mkdir(parents=True,exist_ok=True)
TARGET.write_bytes(first)
sha=hashlib.sha256(first).hexdigest()
data=json.loads(REGISTRY.read_text("utf-8"))
entry=next((d for d in data["documents"] if d["id"]==ID),None)
if not entry:die("missing canonical record")
entry["public"]["pdf"]=entry["public"]["intended_pdf"]
entry["public"]["sha256"]=sha
entry["public"]["verification_status"]="verified_deterministic_public_text_copy; not_byte_identical_original; two_pages; complete_operative_text; private_contact_redacted; original_digital_signature_not_embedded"
REGISTRY.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("EUDA_D110_PUBLIC_TEXT_COPY_OK",len(first),sha)
