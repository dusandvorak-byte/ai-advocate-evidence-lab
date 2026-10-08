#!/usr/bin/env python3
from __future__ import annotations
import hashlib, html, json, re
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, PageBreak

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-08-godot-filings.json"

SPECS=[
 {
  "id":"doc-cz-dd-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni",
  "source":ROOT/"project-memory/godot-text-sources-2026-10-08/2026-10-06-nsz-vsz-spolecne-dukazni-doplneni.txt",
  "target":WEB/"documents/report-04082026-010/116-dd-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni-verejna-textova-kopie.pdf",
  "original_sha":"c831604cc60860d0dee289ea4a39bb61aa5a006f720ad975bcf1ef590fb9c0a7",
  "original_size":86287,
  "pages":5,
  "title":"Mgr. Dušan Dvořák – mimořádně naléhavé společné důkazní doplnění – 6. 10. 2026",
 },
 {
  "id":"doc-cz-ekk-dd-2026-10-08-kpr-nsz-msp-pp-mv-ospro-dukazni-doplneni",
  "source":ROOT/"project-memory/godot-text-sources-2026-10-08/2026-10-08-mimoradne-nalehave-dukazni-doplneni.txt",
  "target":WEB/"documents/report-04082026-010/117-ekk-dd-2026-10-08-dukazni-doplneni-verejna-textova-kopie.pdf",
  "original_sha":"9490a2cde83d76ec9b9fcf838df622e706725de651ed3b807a46e0f3b57fcda3",
  "original_size":156145,
  "pages":9,
  "title":"Edukativní konopná klinika / Mgr. Dušan Dvořák – mimořádně naléhavé důkazní doplnění – 8. 10. 2026",
 },
]
FONT_CANDIDATES=[Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),Path("/usr/share/fonts/dejavu/DejaVuSans.ttf")]
FONT_NAME="GodotFilingsOct8Unicode"

def find_font():
 for p in FONT_CANDIDATES:
  if p.exists(): return p
 raise SystemExit("Unicode font not found")

def sha(data:bytes)->str:
 return hashlib.sha256(data).hexdigest()

def footer(canvas,doc):
 canvas.saveState(); canvas.setFont(FONT_NAME,6.5)
 canvas.drawCentredString(A4[0]/2,8*mm,f"strana {doc.page}")
 canvas.restoreState()

def render(spec,font_path):
 source=spec["source"].read_text("utf-8").strip()
 source=re.sub(r"<PARSED TEXT FOR PAGE: \d+ / \d+>", "\n", source)
 if len(source)<3000: raise SystemExit("Source text too short: "+spec["id"])
 if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
  pdfmetrics.registerFont(TTFont(FONT_NAME,str(font_path)))
 styles=getSampleStyleSheet()
 title=ParagraphStyle("t",parent=styles["Heading1"],fontName=FONT_NAME,fontSize=11.5,leading=14,spaceAfter=4*mm)
 meta=ParagraphStyle("m",parent=styles["BodyText"],fontName=FONT_NAME,fontSize=6.8,leading=8.7,spaceAfter=2*mm)
 body=ParagraphStyle("b",parent=styles["BodyText"],fontName=FONT_NAME,fontSize=7.6,leading=9.7,spaceAfter=1.1*mm)
 target=spec["target"]; target.parent.mkdir(parents=True,exist_ok=True)
 doc=SimpleDocTemplate(str(target),pagesize=A4,leftMargin=14*mm,rightMargin=14*mm,topMargin=13*mm,bottomMargin=14*mm,
  title=spec["title"],author="Evidence Lab – ověřená deterministická veřejná textová kopie",invariant=1)
 story=[
  Paragraph(html.escape(spec["title"]),title),
  Paragraph("OVĚŘENÁ DETERMINISTICKÁ VEŘEJNÁ TEXTOVÁ KOPIE. Vytvořeno z úplného extrahovaného textu uživatelem nahraného PDF. Není byte-identická s originálem a nereprodukuje jeho grafickou úpravu ani metadata.",meta),
  Paragraph("SHA-256 nahraného originálu: "+spec["original_sha"],meta),
  Spacer(1,2*mm),
 ]
 for raw in source.splitlines():
  line=raw.strip()
  story.append(Spacer(1,1.2*mm) if not line else Paragraph(html.escape(line),body))
 doc.build(story,onFirstPage=footer,onLaterPages=footer)
 data=target.read_bytes()
 if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:] or len(data)<4000:
  raise SystemExit("Invalid generated PDF: "+str(target))
 return data

def main():
 font=find_font()
 registry=json.loads(REGISTRY.read_text("utf-8"))
 docs={x["id"]:x for x in registry.get("documents",[])}
 if set(docs)!={x["id"] for x in SPECS}: raise SystemExit("Registry/spec mismatch")
 for spec in SPECS:
  item=docs[spec["id"]]; public=item.setdefault("public",{})
  if public.get("source_original_sha256")!=spec["original_sha"] or public.get("source_original_size_bytes")!=spec["original_size"] or public.get("source_original_page_count")!=spec["pages"]:
   raise SystemExit("Original provenance mismatch: "+spec["id"])
  rel=spec["target"].relative_to(WEB).as_posix()
  if public.get("intended_pdf")!=rel: raise SystemExit("intended_pdf mismatch: "+spec["id"])
  first=render(spec,font); first_sha=sha(first)
  second=render(spec,font); second_sha=sha(second)
  if first!=second or first_sha!=second_sha: raise SystemExit("Non-deterministic PDF: "+spec["id"])
  public["pdf"]=rel
  public["sha256"]=second_sha
  public["verification_status"]="verified_deterministic_public_text_copy; not_byte_identical_original; complete_extracted_text; source_original_sha256="+spec["original_sha"]
  print("GENERATED GODOT FILING PDF",spec["id"],rel,second_sha)
 REGISTRY.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+"\n","utf-8")

if __name__=="__main__":
 main()
