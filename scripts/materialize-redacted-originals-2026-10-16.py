#!/usr/bin/env python3
from __future__ import annotations
import base64, hashlib, json, lzma
from pathlib import Path
import fitz

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
TRANSPORT=ROOT/"project-memory/binary-transport/2026-10-16/redacted-originals"

SOURCES={
 "osz":{
   "sha":"6a667a74a4485ab5ab84cc37733c37289f83cbc056afa1d91f09bf1aef3133c3",
   "size":735993,
   "target":"documents/justice-slalom/2026-10/104-podani-2026-10-12-osz-os-prostejov-redigovany-original.pdf",
   "supplement":"project-memory/documents-2026-supplement-2026-10-12-justice-slalom.json",
   "doc_id":"doc-cz-dd-2026-10-12-osz-os-pro-infz-thc-obnova",
   "manifest":"project-memory/redaction-manifest-2026-10-12-osz-os.json"
 },
 "police":{
   "sha":"41431277c4d28f46ea10bebe9e36899222fbd8b529444e3d78799691f24fab27",
   "size":838345,
   "target":"documents/justice-slalom/2026-10/105-podani-2026-10-15-police-thc-trestni-podnet-redigovany-original.pdf",
   "supplement":"project-memory/documents-2026-supplement-2026-10-15-godot-slalom.json",
   "doc_id":"doc-cz-ekk-2026-10-15-pcr-krpo-krpt-gibs-infz-tp",
   "manifest":"project-memory/redaction-manifest-2026-10-15.json"
 },
 "omb":{
   "sha":"d7886932f27f4c50f0970be472765c7a9db666ca354b8d66dd72e49009e821f2",
   "size":1027196,
   "target":"documents/justice-slalom/2026-10/106-podani-2026-10-15-ombudsman-202602199-redigovany-original.pdf",
   "supplement":"project-memory/documents-2026-supplement-2026-10-15-godot-slalom.json",
   "doc_id":"doc-cz-dd-2026-10-15-eu-ombudsman-202602199-first-supplement",
   "manifest":"project-memory/redaction-manifest-2026-10-15.json"
 }
}

SCAN_SPECS=[
 ("project-memory/historical-scans/2014/police-protection-request-2014-08-11-page-1.jpg","2154a033269f535d96bc298fb35f62c207fcd18ea26c3d9140dfbd02a0a7b8c8"),
 ("project-memory/historical-scans/2014/police-protection-request-2014-08-11-page-2.jpg","44c3cf322dec551fe50bd45c0fd9d03b9f23ebff91a66cfb67acc55f17774966")
]

def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def reconstruct(key:str)->bytes:
    spec=SOURCES[key]
    base=TRANSPORT/key
    meta=json.loads((base/"manifest.json").read_text("utf-8"))
    if meta.get("sha256")!=spec["sha"] or meta.get("size")!=spec["size"]:
        raise SystemExit(f"{key}: manifest source mismatch")
    parts=[]
    for i,expected in enumerate(meta.get("chunk_sha256",[])):
        p=base/f"part-{i:03d}.xz.b64"
        txt=p.read_text("ascii").strip()
        if sha(txt.encode("ascii"))!=expected:
            raise SystemExit(f"{key}: transport chunk mismatch {i}")
        parts.append(txt)
    try:
        raw=lzma.decompress(base64.b64decode("".join(parts),validate=True))
    except Exception as exc:
        raise SystemExit(f"{key}: cannot reconstruct source: {exc}")
    if len(raw)!=spec["size"] or sha(raw)!=spec["sha"] or not raw.startswith(b"%PDF-") or b"%%EOF" not in raw[-4096:]:
        raise SystemExit(f"{key}: reconstructed PDF integrity mismatch")
    return raw

def append_scans(raw:bytes)->bytes:
    doc=fitz.open(stream=raw,filetype="pdf")
    for rel,expected in SCAN_SPECS:
        p=ROOT/rel
        data=p.read_bytes()
        if sha(data)!=expected:
            raise SystemExit("Historical scan SHA mismatch: "+rel)
        pix=fitz.Pixmap(str(p))
        page=doc.new_page(width=595.276,height=841.89)
        margin=12
        avail=fitz.Rect(margin,margin,page.rect.width-margin,page.rect.height-margin)
        scale=min(avail.width/pix.width,avail.height/pix.height)
        w=pix.width*scale; h=pix.height*scale
        rect=fitz.Rect((page.rect.width-w)/2,(page.rect.height-h)/2,(page.rect.width+w)/2,(page.rect.height+h)/2)
        page.insert_image(rect,filename=str(p),keep_proportion=True)
    tmp=ROOT/"project-memory"/".tmp-police-redacted-original-with-2014.pdf"
    doc.set_metadata({**(doc.metadata or {}),"title":"Žádost policii 15. 10. 2026 - redigovaný originál + historická příloha 11. 8. 2014"})
    doc.save(tmp,garbage=4,deflate=True,clean=True)
    doc.close()
    out=tmp.read_bytes()
    tmp.unlink(missing_ok=True)
    if not out.startswith(b"%PDF-") or b"%%EOF" not in out[-4096:]:
        raise SystemExit("Police final PDF invalid")
    return out

def update_registry(spec:dict, public_bytes:bytes, base_sha:str, police_appendix:bool=False):
    path=ROOT/spec["supplement"]
    data=json.loads(path.read_text("utf-8"))
    item=next((d for d in data.get("documents",[]) if d.get("id")==spec["doc_id"]),None)
    if not item:
        raise SystemExit("Missing canonical item "+spec["doc_id"])
    digest=sha(public_bytes)
    item["public"]["pdf"]=spec["target"]
    item["public"]["intended_pdf"]=spec["target"]
    item["public"]["sha256"]=digest
    item["public"]["verification_status"]="redacted_original_from_uploaded_binary; original_layout_preserved; direct_personal_identifiers_reduced; not_byte_identical_source_original"
    if police_appendix:
        item["public"]["verification_status"]+="; historical_2014_scan_appendix_2_pages"
    item["public"]["redacted_original_sha256"]=base_sha
    item["public"]["public_copy_manifest"]=spec["manifest"]
    slalom=item["justice_slalom"]
    slalom["source_kind"]="redacted_original_from_user_binary"
    slalom["public_sha256"]=digest
    slalom["redacted_original_sha256"]=base_sha
    slalom["redaction_manifest"]=spec["manifest"]
    if police_appendix:
        slalom["historical_appendix"]={
          "title":"Žádost o zajištění policejní ochrany a další podněty",
          "issue_date":"2014-08-11",
          "recipients":"ministr vnitra ČR a policejní prezident",
          "page1_source_sha256":SCAN_SPECS[0][1],
          "page2_source_sha256":SCAN_SPECS[1][1]
        }
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n","utf-8")
    return digest

for key,spec in SOURCES.items():
    base=reconstruct(key)
    final=append_scans(base) if key=="police" else base
    target=WEB/spec["target"]
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(final)
    digest=update_registry(spec,final,sha(base),key=="police")
    print("MATERIALIZED REDACTED ORIGINAL",key,spec["target"],digest,len(final))
