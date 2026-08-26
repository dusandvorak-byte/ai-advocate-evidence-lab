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
ROOT=Path(__file__).resolve().parents[1]; WEB=ROOT/'web'; OUT=WEB/'documents'/'report-04082026-010'
REGISTRY=ROOT/'project-memory'/'documents-2026-supplement-2026-08-26-ks-ostrava.json'
SOURCE=ROOT/'project-memory'/'state-text-sources-2026-08-26'/'78-ks-ostrava-st-82-2026.txt'
TARGET_NAME='78-ks-ostrava-st-82-2026-15-t-11-2025-2026-08-26.pdf'
FONT_CANDIDATES=[Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/dejavu/DejaVuSans.ttf')]
def font():
    for p in FONT_CANDIDATES:
        if p.exists(): return p
    raise SystemExit('Unicode font not found')
def digest(path):
    h=hashlib.sha256();
    with path.open('rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''): h.update(c)
    return h.hexdigest()
def pn(canvas,doc):
    canvas.saveState(); canvas.setFont('StateUnicode',8); canvas.drawCentredString(A4[0]/2,10*mm,f'Strana {doc.page}'); canvas.restoreState()
def main():
    if not SOURCE.exists(): raise SystemExit(f'Missing source {SOURCE}')
    pdfmetrics.registerFont(TTFont('StateUnicode',str(font()))); OUT.mkdir(parents=True,exist_ok=True); target=OUT/TARGET_NAME
    styles=getSampleStyleSheet(); warning=ParagraphStyle('warning',parent=styles['Heading2'],fontName='StateUnicode',fontSize=10,leading=14,alignment=TA_CENTER,spaceAfter=8*mm); body=ParagraphStyle('body',parent=styles['BodyText'],fontName='StateUnicode',fontSize=9.2,leading=12.2,spaceAfter=2.2*mm); meta=ParagraphStyle('meta',parent=body,fontSize=8.4,leading=11)
    doc=SimpleDocTemplate(str(target),pagesize=A4,rightMargin=18*mm,leftMargin=18*mm,topMargin=17*mm,bottomMargin=18*mm,title=target.stem,author='Evidence Lab / veřejná kopie z ověřeného textového přepisu')
    story=[Paragraph('OVĚŘENÁ VEŘEJNÁ KOPIE PDF',warning),Paragraph('Tato veřejná kopie byla vytvořena z ověřeného textového přepisu listiny. Nejde o byte-identický originální soubor; obsah je publikován pro veřejnou evidenci a čitelnost.',meta),Spacer(1,4*mm)]
    for raw in SOURCE.read_text(encoding='utf-8').splitlines():
        story.append(Spacer(1,2.2*mm) if not raw.strip() else Paragraph(html.escape(raw).replace('  ','&nbsp;&nbsp;'),body))
    doc.build(story,onFirstPage=pn,onLaterPages=pn)
    if target.read_bytes()[:5]!=b'%PDF-': raise SystemExit('Generated file is not a PDF')
    sha=digest(target); reg=json.loads(REGISTRY.read_text(encoding='utf-8')); rel=target.relative_to(WEB).as_posix(); matched=0
    for item in reg.get('documents',[]):
        public=item.get('public') or {}
        if public.get('intended_pdf')==rel:
            public['pdf']=rel; public['sha256']=sha; public['verification_status']='generated_public_copy_from_verified_text; not_byte_identical_original'; item['public']=public; matched+=1
    if matched!=1: raise SystemExit(f'Registry patch incomplete: {matched}/1')
    REGISTRY.write_text(json.dumps(reg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(f'GENERATED KS OSTRAVA PDF {rel} {sha}')
if __name__=='__main__': main()
