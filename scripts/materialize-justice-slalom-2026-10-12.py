#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
SOURCE=ROOT/"project-memory/user-text-sources-2026-10-12/osz-os-prostejov-infz-redacted.txt"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-12-justice-slalom.json"
TARGET=WEB/"documents/justice-slalom/2026-10/104-podani-2026-10-12-osz-os-prostejov-verejna-kopie.pdf"
ORIGINAL_SHA="ada11ba357a53eac04bc4e599eaf5fade745660181be7029de3f1c932f52f9c9"
EXPECTED_PUBLIC_SHA="7d30aa7e345d2fc4b7738bffea827c880371867b0d4c27392499c1056d818000"
PAGES=6
FONT=Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")

_registry_pre=json.loads(REGISTRY.read_text("utf-8"))
_doc_pre=next((x for x in _registry_pre.get("documents",[]) if x.get("id")=="doc-cz-dd-2026-10-12-osz-os-pro-infz-thc-obnova"),None)
if _doc_pre and (_doc_pre.get("justice_slalom") or {}).get("source_kind")=="redacted_original_from_user_binary":
    print("SKIP LEGACY PUBLIC COPY 2026-10-12: redacted original is canonical")
    raise SystemExit(0)

def sha256(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def wrap_line(line,font,size,max_width):
    line=line.replace("\t","    ").rstrip()
    if not line: return [""]
    words=line.split(" "); out=[]; cur=""
    for word in words:
        cand=word if not cur else cur+" "+word
        if pdfmetrics.stringWidth(cand,font,size)<=max_width:
            cur=cand; continue
        if cur: out.append(cur); cur=""
        if pdfmetrics.stringWidth(word,font,size)<=max_width:
            cur=word; continue
        frag=""
        for ch in word:
            cand=frag+ch
            if pdfmetrics.stringWidth(cand,font,size)<=max_width:
                frag=cand
            else:
                if frag: out.append(frag)
                frag=ch
        cur=frag
    if cur: out.append(cur)
    return out or [""]

def fit_page(text,font,uw,uh):
    for size in (6.8,6.4,6.0,5.6,5.2,4.8,4.5):
        leading=size*1.22; lines=[]
        for raw in text.splitlines(): lines.extend(wrap_line(raw,font,size,uw))
        if len(lines)<=int(uh//leading): return size,leading,lines
    raise SystemExit("A redacted source page cannot fit without dropping text")

text=SOURCE.read_text("utf-8")
if f"ORIGINAL_SHA256: {ORIGINAL_SHA}" not in text or "ORIGINAL_PAGES: 6" not in text:
    raise SystemExit("Source provenance mismatch")
for forbidden in ("Radomíry Dvořákové","Vandy Dvořákové","Františka Dvořáka","Jany Dvořákové","12. ledna 1962","Ospělov 6","r8u3nhx"):
    if forbidden in text:
        raise SystemExit("Privacy redaction failure: "+forbidden)
body=text.split("\n\n",1)[1]
pat=re.compile(r"<PARSED TEXT FOR PAGE:\s*(\d+)\s*/\s*(\d+)>")
ms=list(pat.finditer(body))
if len(ms)!=PAGES: raise SystemExit(f"Expected {PAGES} source pages, got {len(ms)}")
pages=[]
for i,m in enumerate(ms):
    start=m.end(); end=ms[i+1].start() if i+1<len(ms) else len(body)
    page=body[start:end].strip()
    if not page: raise SystemExit("Empty extracted page")
    pages.append(page)

font_name="EvidenceUnicode"
pdfmetrics.registerFont(TTFont(font_name,str(FONT)))
TARGET.parent.mkdir(parents=True,exist_ok=True)
c=canvas.Canvas(str(TARGET),pagesize=A4,pageCompression=1,invariant=1)
c.setTitle("Žádost OSZ a OS Prostějov – 12. října 2026 – veřejná redigovaná textová kopie")
c.setAuthor("Evidence Lab – verified redacted public text copy")
w,h=A4; left=13*mm; right=13*mm; top=18*mm; bottom=15*mm; gap=9*mm
uw=w-left-right; uh=h-top-bottom-gap
for n,p in enumerate(pages,1):
    c.setFont(font_name,7.0); c.drawString(left,h-10*mm,"OVĚŘENÁ REDIGOVANÁ VEŘEJNÁ TEXTOVÁ KOPIE")
    c.setFont(font_name,5.6); c.drawRightString(w-right,h-10*mm,f"zdrojová strana {n}/{len(pages)} · originál SHA-256 {ORIGINAL_SHA[:16]}…")
    c.setFont(font_name,5.2); c.drawString(left,h-14*mm,"Úplný extrahovaný text s anonymizací soukromých osob a přímých identifikátorů; grafická podoba originálu není reprodukována.")
    c.line(left,h-15.5*mm,w-right,h-15.5*mm)
    size,leading,lines=fit_page(p,font_name,uw,uh)
    t=c.beginText(left,h-top-gap); t.setFont(font_name,size); t.setLeading(leading)
    for line in lines: t.textLine(line)
    c.drawText(t)
    c.setFont(font_name,5.5); c.drawRightString(w-right,7*mm,f"{n} / {len(pages)}")
    c.showPage()
c.save()
raw=TARGET.read_bytes()
actual=sha256(raw)
if raw[:5]!=b"%PDF-" or b"%%EOF" not in raw[-2048:] or actual!=EXPECTED_PUBLIC_SHA:
    raise SystemExit(f"Public-copy integrity mismatch: {actual}")
registry=json.loads(REGISTRY.read_text("utf-8"))
doc=next((x for x in registry.get("documents",[]) if x.get("id")=="doc-cz-dd-2026-10-12-osz-os-pro-infz-thc-obnova"),None)
if not doc: raise SystemExit("Canonical document missing")
if doc["public"].get("sha256")!=actual or doc["justice_slalom"].get("public_sha256")!=actual:
    raise SystemExit("Canonical public-copy SHA mismatch")
print("MATERIALIZED REDACTED PUBLIC COPY",actual,TARGET.relative_to(WEB))
