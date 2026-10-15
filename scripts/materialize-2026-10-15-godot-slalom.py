#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image as PILImage

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-15-godot-slalom.json"
FONT=Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")

SPECS=[
 {
  "id":"doc-eu-euda-2026-10-15-access-followup",
  "source":"project-memory/state-text-sources-2026-10-15/euda-access-followup-redacted.txt",
  "target":"documents/report-04082026-010/119-euda-access-followup-2026-10-15-verejna-kopie.pdf",
  "original_sha":"ec91f57eec2d1a34a710cf7c09aecfde9964ad086fa2a935f210dd5507e8b292",
  "source_pages":10,
  "label":"OVĚŘENÁ REDIGOVANÁ VEŘEJNÁ TEXTOVÁ KOPIE – EUDA 15. 10. 2026",
  "append_scans":[]
 },
 {
  "id":"doc-cz-dd-2026-10-15-eu-ombudsman-202602199-first-supplement",
  "source":"project-memory/user-text-sources-2026-10-15/ombudsman-supplement-redacted.txt",
  "target":"documents/justice-slalom/2026-10/106-podani-2026-10-15-ombudsman-202602199-verejna-kopie.pdf",
  "original_sha":"a4c2a3eb32c34192791d544ca3f47d19b4763631cb556913257d7e253e71d5fb",
  "source_pages":13,
  "label":"OVĚŘENÁ REDIGOVANÁ VEŘEJNÁ TEXTOVÁ KOPIE – OMBUDSMAN 15. 10. 2026",
  "append_scans":[]
 },
 {
  "id":"doc-cz-ekk-2026-10-15-pcr-krpo-krpt-gibs-infz-tp",
  "source":"project-memory/user-text-sources-2026-10-15/police-request-redacted.txt",
  "target":"documents/justice-slalom/2026-10/105-podani-2026-10-15-police-thc-trestni-podnet-verejna-kopie.pdf",
  "original_sha":"df2a9b2340251c7e01adfd79c25ca273c4606f7259288c1e4bb1daab7d5967d6",
  "source_pages":17,
  "label":"OVĚŘENÁ REDIGOVANÁ VEŘEJNÁ TEXTOVÁ KOPIE – POLICIE 15. 10. 2026",
  "append_scans":[
    ["project-memory/historical-scans/2014/police-protection-request-2014-08-11-page-1.jpg","2154a033269f535d96bc298fb35f62c207fcd18ea26c3d9140dfbd02a0a7b8c8"],
    ["project-memory/historical-scans/2014/police-protection-request-2014-08-11-page-2.jpg","44c3cf322dec551fe50bd45c0fd9d03b9f23ebff91a66cfb67acc55f17774966"]
  ]
 }
]

def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def wrap_line(line,font,size,max_width):
    line=line.replace("\t","    ").rstrip()
    if not line: return [""]
    words=line.split(" ")
    out=[]; cur=""
    for word in words:
        candidate=word if not cur else cur+" "+word
        if pdfmetrics.stringWidth(candidate,font,size)<=max_width:
            cur=candidate
            continue
        if cur:
            out.append(cur)
            cur=""
        if pdfmetrics.stringWidth(word,font,size)<=max_width:
            cur=word
            continue
        frag=""
        for ch in word:
            candidate=frag+ch
            if pdfmetrics.stringWidth(candidate,font,size)<=max_width:
                frag=candidate
            else:
                if frag: out.append(frag)
                frag=ch
        cur=frag
    if cur: out.append(cur)
    return out or [""]

def fit_page(text,font,max_width,max_height):
    for size in (6.8,6.4,6.0,5.6,5.2,4.8,4.5,4.2,4.0):
        leading=size*1.20
        lines=[]
        for raw in text.splitlines():
            lines.extend(wrap_line(raw,font,size,max_width))
        if len(lines)<=int(max_height//leading):
            return size,leading,lines
    raise SystemExit("A source page cannot fit without dropping text")

def parse_pages(text:str, expected:int):
    body=text.split("\n\n",1)[1] if "\n\n" in text else text
    pattern=re.compile(r"<PARSED TEXT FOR PAGE:\s*(\d+)\s*/\s*(\d+)>")
    matches=list(pattern.finditer(body))
    if len(matches)!=expected:
        raise SystemExit(f"Expected {expected} parsed pages, got {len(matches)}")
    pages=[]
    for i,m in enumerate(matches):
        end=matches[i+1].start() if i+1<len(matches) else len(body)
        page=body[m.end():end].strip()
        if not page:
            raise SystemExit("Empty parsed page")
        pages.append(page)
    return pages

def render_text_pages(c, pages, label, original_sha):
    w,h=A4
    left=12*mm; right=12*mm; top=18*mm; bottom=13*mm; header_gap=8*mm
    usable_w=w-left-right
    usable_h=h-top-bottom-header_gap
    for n,p in enumerate(pages,1):
        c.setFont("EvidenceUnicode",7.0)
        c.drawString(left,h-9*mm,label)
        c.setFont("EvidenceUnicode",5.3)
        c.drawRightString(w-right,h-9*mm,f"zdrojová strana {n}/{len(pages)} · originál SHA-256 {original_sha[:16]}…")
        c.drawString(left,h-13*mm,"Veřejná kopie zachovává věcný text; vybrané osobní identifikátory byly anonymizovány.")
        c.line(left,h-14.5*mm,w-right,h-14.5*mm)
        size,leading,lines=fit_page(p,"EvidenceUnicode",usable_w,usable_h)
        t=c.beginText(left,h-top-header_gap)
        t.setFont("EvidenceUnicode",size)
        t.setLeading(leading)
        for line in lines:
            t.textLine(line)
        c.drawText(t)
        c.setFont("EvidenceUnicode",5.4)
        c.drawRightString(w-right,7*mm,f"{n} / {len(pages)}")
        c.showPage()

def render_scan_page(c, path:Path, index:int, total:int):
    w,h=A4
    c.setFont("EvidenceUnicode",7.2)
    c.drawString(12*mm,h-9*mm,"HISTORICKÁ PŘÍLOHA – žádost o zajištění policejní ochrany ze dne 11. 8. 2014")
    c.setFont("EvidenceUnicode",5.4)
    c.drawString(12*mm,h-13*mm,"Sken původní listiny; příloha k veřejné kopii podání z 15. 10. 2026, nikoli součást jeho binárního originálu.")
    c.line(12*mm,h-14.5*mm,w-12*mm,h-14.5*mm)
    with PILImage.open(path) as im:
        iw,ih=im.size
    max_w=w-18*mm
    max_h=h-31*mm
    scale=min(max_w/iw,max_h/ih)
    dw=iw*scale; dh=ih*scale
    x=(w-dw)/2; y=(h-17*mm-dh)/2
    c.drawImage(ImageReader(str(path)),x,y,width=dw,height=dh,preserveAspectRatio=True,mask='auto')
    c.setFont("EvidenceUnicode",5.5)
    c.drawRightString(w-12*mm,7*mm,f"historická příloha {index}/{total}")
    c.showPage()

def main():
    pdfmetrics.registerFont(TTFont("EvidenceUnicode",str(FONT)))
    registry=json.loads(REGISTRY.read_text("utf-8"))
    by_id={x["id"]:x for x in registry.get("documents",[])}
    for spec in SPECS:
        source=(ROOT/spec["source"])
        text=source.read_text("utf-8")
        if f"ORIGINAL_SHA256: {spec['original_sha']}" not in text:
            raise SystemExit("Source provenance mismatch "+spec["id"])
        pages=parse_pages(text,spec["source_pages"])
        target=WEB/spec["target"]
        target.parent.mkdir(parents=True,exist_ok=True)
        c=canvas.Canvas(str(target),pagesize=A4,pageCompression=1,invariant=1)
        c.setTitle(spec["label"])
        c.setAuthor("Evidence Lab – verified public copy")
        render_text_pages(c,pages,spec["label"],spec["original_sha"])
        scans=spec["append_scans"]
        for idx,pair in enumerate(scans,1):
            rel,expected_scan_sha=pair
            p=ROOT/rel
            if not p.exists(): raise SystemExit("Historical scan missing "+rel)
            if sha(p.read_bytes())!=expected_scan_sha:
                raise SystemExit("Historical scan SHA mismatch "+rel)
            render_scan_page(c,p,idx,len(scans))
        c.save()
        raw=target.read_bytes()
        if not raw.startswith(b"%PDF-") or b"%%EOF" not in raw[-4096:] or len(raw)<5000:
            raise SystemExit("Generated PDF incomplete "+spec["id"])
        digest=sha(raw)
        item=by_id.get(spec["id"])
        if not item: raise SystemExit("Registry item missing "+spec["id"])
        item["public"]["pdf"]=spec["target"]
        item["public"]["sha256"]=digest
        item["public"]["verification_status"]="verified_redacted_public_copy_generated_from_complete_extracted_text; not_byte_identical_original"
        if scans:
            item["public"]["verification_status"]+="; historical_2014_scan_appendix_2_pages"
        slalom=item.get("justice_slalom")
        if slalom is not None:
            slalom["public_sha256"]=digest
        print("GENERATED",spec["id"],spec["target"],digest,len(raw))
    REGISTRY.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+"\n","utf-8")

if __name__=="__main__":
    main()
