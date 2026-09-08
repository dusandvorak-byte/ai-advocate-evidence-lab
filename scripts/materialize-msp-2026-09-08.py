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
WEB=ROOT/'web'
SOURCE=ROOT/'project-memory/state-text-sources-2026-09-08/msp-19-2026-odka-roz-27-2026-09-08.txt'
REGISTRY=ROOT/'project-memory/documents-2026-supplement-2026-09-08-msp.json'
TARGET=WEB/'documents/report-04082026-010/msp-19-2026-odka-roz-27-2026-09-08-verejna-kopie.pdf'
FONT_CANDIDATES=[Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/dejavu/DejaVuSans.ttf'),Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')]

def font_path():
    for p in FONT_CANDIDATES:
        if p.exists(): return p
    raise SystemExit('Unicode font not found')

def footer(canvas,doc):
    canvas.saveState(); canvas.setFont('StateUnicode',8); canvas.drawCentredString(A4[0]/2,10*mm,f'Strana {doc.page}'); canvas.restoreState()

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    if not SOURCE.exists() or not SOURCE.read_text('utf-8').strip(): raise SystemExit('Missing verified MSP text source')
    pdfmetrics.registerFont(TTFont('StateUnicode',str(font_path())))
    styles=getSampleStyleSheet()
    warning=ParagraphStyle('warning',parent=styles['Heading2'],fontName='StateUnicode',fontSize=10,leading=14,alignment=TA_CENTER,spaceAfter=7*mm)
    body=ParagraphStyle('body',parent=styles['BodyText'],fontName='StateUnicode',fontSize=9.2,leading=12.2,spaceAfter=2.1*mm)
    meta=ParagraphStyle('meta',parent=body,fontSize=8.4,leading=11)
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    doc=SimpleDocTemplate(str(TARGET),pagesize=A4,rightMargin=18*mm,leftMargin=18*mm,topMargin=17*mm,bottomMargin=18*mm,title='MSP-19/2026-ODKA-ROZ/27 – veřejná kopie',author='Evidence Lab / ověřená veřejná kopie z textového přepisu')
    story=[Paragraph('OVĚŘENÁ VEŘEJNÁ KOPIE PDF',warning),Paragraph('Tato veřejná kopie byla vytvořena z ověřeného textového přepisu nahrané úřední listiny. Nejde o byte-identický originální PDF soubor a nereprodukuje jeho elektronický podpis ani původní metadata.',meta),Spacer(1,4*mm)]
    for raw in SOURCE.read_text('utf-8').splitlines():
        if not raw.strip(): story.append(Spacer(1,2*mm))
        else: story.append(Paragraph(html.escape(raw.rstrip()).replace('  ','&nbsp;&nbsp;'),body))
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    if TARGET.read_bytes()[:5] != b'%PDF-': raise SystemExit('Generated MSP public copy is not PDF')
    digest=sha256(TARGET)
    registry=json.loads(REGISTRY.read_text('utf-8'))
    item=registry['documents'][0]
    item['public']['pdf']=TARGET.relative_to(WEB).as_posix()
    item['public']['sha256']=digest
    item['public']['verification_status']='generated_public_copy_from_verified_text; not_byte_identical_original; uploaded_original_sha256_06aa9bcdd52cb7242bea04c71cd63cfd50e5caf0b0b35b6fd6164df565be7a33'
    REGISTRY.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(f'GENERATED MSP 2026-09-08 PUBLIC COPY {item["public"]["pdf"]} {digest}')
if __name__=='__main__': main()
