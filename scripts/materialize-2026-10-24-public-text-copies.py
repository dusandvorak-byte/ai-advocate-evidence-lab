#!/usr/bin/env python3
import json,hashlib,html
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer
root=Path(__file__).resolve().parents[1]
docs=json.loads((root/"project-memory/documents-2026-supplement-2026-10-24-four-additional-records.json").read_text())["documents"]
dmap={x["id"]:x for x in docs}
source=root/"project-memory/verified-text-sources-2026-10-24"
outdir=root/"web/documents/report-04082026-010";outdir.mkdir(parents=True,exist_ok=True)
items=[
("doc-cz-dd-2026-10-21-os-prostejov-doplneni-bezplatne-obhajoby","os-prostejov-doplneni-redigovane.txt","136-os-prostejov-dd-2026-10-21-verejna-redigovana-textova-kopie.pdf"),
("doc-cz-uoou-2026-10-23-uoou-05032-26-6","uoou-05032-26-6.txt","137-uoou-05032-26-6-2026-10-23-verejna-textova-kopie.pdf"),
("doc-cz-ns-2026-10-23-zin-208-2026","ns-zin-208-2026.txt","138-ns-zin-208-2026-2026-10-23-verejna-textova-kopie.pdf"),
("doc-cz-dd-2026-10-24-cak-doplneni-zadosti-urceni-advokata","cak-pruvodni-dopis-redigovany.txt","139-cak-dd-2026-10-24-verejna-redigovana-textova-kopie.pdf")]
pdfmetrics.registerFont(TTFont("OctSans","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
a=ParagraphStyle("text",fontName="OctSans",fontSize=8,leading=12,spaceAfter=3)
h=ParagraphStyle("h",parent=a,fontSize=12,leading=17,spaceAfter=12)
for docid,filename,output in items:
 doc=dmap[docid];text=(source/filename).read_text(encoding="utf8")
 assert len(text)>3000,(filename,len(text))
 story=[Paragraph(html.escape(doc["user_title"]),h),Paragraph("OVĚŘENÁ VEŘEJNÁ TEXTOVÁ KOPIE – NENÍ BINÁRNÍM ORIGINÁLEM. Případné soukromé identifikátory jsou redigovány.",a),Paragraph("Datum: "+doc["issue_date"]+" | Č. j.: "+html.escape(doc["reference"]),a),Spacer(1,10)]
 for line in text.splitlines():
  story.append(Paragraph(html.escape(line.strip()),a) if line.strip() else Spacer(1,5))
 dest=outdir/output;SimpleDocTemplate(str(dest),pagesize=A4,leftMargin=35,rightMargin=35,topMargin=35,bottomMargin=35).build(story)
 data=dest.read_bytes();assert data[:5]==b"%PDF-" and b"%%EOF" in data[-2048:]
 print(output,len(data),hashlib.sha256(data).hexdigest())
