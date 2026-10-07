#!/usr/bin/env python3
from __future__ import annotations
import hashlib, html, json
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
SOURCE=ROOT/"project-memory/state-text-sources-2026-10-07/mv-134798-4-so-2026.txt"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-07-mv-rozklad.json"
TARGET=WEB/"documents/report-04082026-010/115-mv-134798-4-so-2026-2026-10-07-verejna-textova-kopie.pdf"
DOC_ID="doc-cz-mv-2026-10-07-mv-134798-4-so-2026"
ORIGINAL_SHA="3309bb2da6053045d842ef2d9263dcdeab4fcce2d399264da08a7233f15b9366"
FONT_NAME="MvRozkladOct7Unicode"
FONT_CANDIDATES=[Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),Path("/usr/share/fonts/dejavu/DejaVuSans.ttf")]

def sha256(b:bytes)->str: return hashlib.sha256(b).hexdigest()
def font_path():
    for p in FONT_CANDIDATES:
        if p.exists(): return p
    raise SystemExit("Unicode font not found")
def footer(canvas,doc):
    canvas.saveState(); canvas.setFont(FONT_NAME,6.5)
    canvas.drawCentredString(A4[0]/2,8*mm,f"strana {doc.page}"); canvas.restoreState()

def render()->bytes:
    text=SOURCE.read_text("utf-8").strip()
    if len(text)<8000 or "MV-134798-4/SO-2026" not in text or "z r u š u j e a věc se v r a c í k novému projednání" not in text:
        raise SystemExit("Incomplete verified source text")
    if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME,str(font_path())))
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    styles=getSampleStyleSheet()
    title=ParagraphStyle("mv-title",parent=styles["Heading1"],fontName=FONT_NAME,fontSize=11.5,leading=14,spaceAfter=4*mm)
    meta=ParagraphStyle("mv-meta",parent=styles["BodyText"],fontName=FONT_NAME,fontSize=6.8,leading=8.6,spaceAfter=2.5*mm)
    body=ParagraphStyle("mv-body",parent=styles["BodyText"],fontName=FONT_NAME,fontSize=8.0,leading=10.3,spaceAfter=1.3*mm)
    doc=SimpleDocTemplate(str(TARGET),pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=14*mm,bottomMargin=14*mm,
        title="Ministerstvo vnitra – MV-134798-4/SO-2026 – 7. 10. 2026",author="Evidence Lab – ověřená deterministická veřejná textová kopie",invariant=1)
    story=[
      Paragraph("Ministerstvo vnitra – MV-134798-4/SO-2026 – 7. 10. 2026",title),
      Paragraph("OVĚŘENÁ DETERMINISTICKÁ VEŘEJNÁ TEXTOVÁ KOPIE. Vytvořena z úplného extrahovaného textu uživatelem nahraného šestistránkového PDF. Není byte-identická s originálem a nereprodukuje jeho grafickou úpravu, elektronický podpis ani metadata.",meta),
      Paragraph("SHA-256 nahraného originálu: "+ORIGINAL_SHA,meta),Spacer(1,2*mm)
    ]
    for raw in text.splitlines():
        line=raw.strip()
        story.append(Spacer(1,1.4*mm) if not line else Paragraph(html.escape(line),body))
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    data=TARGET.read_bytes()
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:] or len(data)<5000: raise SystemExit("Invalid generated PDF")
    return data

def main():
    reg=json.loads(REGISTRY.read_text("utf-8"))
    item=next((x for x in reg.get("documents",[]) if x.get("id")==DOC_ID),None)
    if not item: raise SystemExit("Missing canonical record")
    public=item.setdefault("public",{})
    if public.get("source_original_sha256")!=ORIGINAL_SHA: raise SystemExit("Original SHA provenance mismatch")
    rel=TARGET.relative_to(WEB).as_posix()
    if public.get("intended_pdf")!=rel: raise SystemExit("intended_pdf mismatch")
    a=render(); sa=sha256(a); b=render(); sb=sha256(b)
    if a!=b or sa!=sb: raise SystemExit("Non-deterministic public text copy")
    public["pdf"]=rel; public["sha256"]=sb
    public["verification_status"]="verified_deterministic_public_text_copy; not_byte_identical_original; complete_extracted_text; source_original_sha256="+ORIGINAL_SHA
    REGISTRY.write_text(json.dumps(reg,ensure_ascii=False,indent=2)+"\n","utf-8")
    print("GENERATED",DOC_ID,rel,sb)

if __name__=="__main__": main()
