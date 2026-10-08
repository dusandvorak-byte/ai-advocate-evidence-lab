#!/usr/bin/env python3
from __future__ import annotations
import base64, hashlib, json, lzma
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
PARTS=ROOT/"project-memory/binary-transport/2026-10-08/mv-134798-4-so-2026"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-07-mv-rozklad.json"
TARGET=WEB/"documents/report-04082026-010/115-mv-134798-4-so-2026-2026-10-07.pdf"
DOC_ID="doc-cz-mv-2026-10-07-mv-134798-4-so-2026"
ORIGINAL_SHA="3309bb2da6053045d842ef2d9263dcdeab4fcce2d399264da08a7233f15b9366"
ORIGINAL_SIZE=274596

def sha256(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def load_original()->bytes:
    parts=sorted(PARTS.glob("part-*.xz.b64"))
    if len(parts)!=6:
        raise SystemExit(f"Expected 6 MV binary transport parts, found {len(parts)}")
    encoded="".join(p.read_text("ascii").strip() for p in parts)
    try:
        data=lzma.decompress(base64.b64decode(encoded,validate=True))
    except Exception as exc:
        raise SystemExit(f"Cannot reconstruct MV original: {exc}")
    if len(data)!=ORIGINAL_SIZE or sha256(data)!=ORIGINAL_SHA:
        raise SystemExit("MV original size/SHA mismatch")
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
        raise SystemExit("MV original is not a complete PDF")
    return data

def main()->None:
    data=load_original()
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    TARGET.write_bytes(data)

    registry=json.loads(REGISTRY.read_text("utf-8"))
    item=next((x for x in registry.get("documents",[]) if x.get("id")==DOC_ID),None)
    if not item:
        raise SystemExit("Missing MV canonical record")
    public=item.setdefault("public",{})
    if public.get("source_original_sha256")!=ORIGINAL_SHA or public.get("source_original_size_bytes")!=ORIGINAL_SIZE:
        raise SystemExit("MV original provenance mismatch")
    rel=TARGET.relative_to(WEB).as_posix()
    if public.get("intended_pdf")!=rel:
        raise SystemExit("MV intended_pdf mismatch")
    public["pdf"]=rel
    public["sha256"]=ORIGINAL_SHA
    public["verification_status"]="source_pdf_received_binary_original; sha256_verified; 6_pages_reviewed"
    registry.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+"\n","utf-8")
    print("MATERIALIZED MV ORIGINAL",rel,ORIGINAL_SHA)

if __name__=="__main__":
    main()
