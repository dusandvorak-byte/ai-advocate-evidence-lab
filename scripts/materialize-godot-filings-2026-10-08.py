#!/usr/bin/env python3
from __future__ import annotations
import base64, hashlib, json, lzma
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"
REGISTRY=ROOT/"project-memory/documents-2026-supplement-2026-10-08-godot-filings.json"
TRANSPORT=ROOT/"project-memory/binary-transport/2026-10-08/godot-slalom"

SPECS=[
 {
  "id":"doc-eu-omb-2026-10-07-202602199-registration",
  "parts":"eu-ombudsman-202602199",
  "target":"documents/report-04082026-010/116-eu-ombudsman-202602199-2026-10-07.pdf",
  "sha":"8da9712f3ea540ce2b5f6364175b06eb9e95dfa826506f7be758d998ab9fcdc2",
  "size":53281,"pages":2,"part_count":2,
 },
 {
  "id":"doc-cz-ms-pha-2026-10-06-15-ad-14-2026-13",
  "parts":"ms-15-ad-14-13",
  "target":"documents/report-04082026-010/117-ms-praha-15-ad-14-2026-13-2026-10-06.pdf",
  "sha":"25ecfff3def2fe8b328cc90bf970801b2778038befb9e0330e6abeb968c1a2c8",
  "size":181141,"pages":4,"part_count":5,
 },
 {
  "id":"doc-cz-ms-pha-2026-10-07-15-ad-14-2026-17",
  "parts":"ms-15-ad-14-17",
  "target":"documents/report-04082026-010/118-ms-praha-15-ad-14-2026-17-2026-10-07.pdf",
  "sha":"72c6162e095559546988d4f8b0e2423a486d6213c4881fb2b240b44fd5275383",
  "size":109261,"pages":1,"part_count":3,
 },
 {
  "id":"doc-cz-dd-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni",
  "parts":"slalom-2026-10-06-nsz-vsz",
  "target":"documents/justice-slalom/2026-10/099-podani-2026-10-06-nsz-vsz.pdf",
  "sha":"c831604cc60860d0dee289ea4a39bb61aa5a006f720ad975bcf1ef590fb9c0a7",
  "size":86287,"pages":5,"part_count":3,
 },
 {
  "id":"doc-cz-ekk-dd-2026-10-08-kpr-nsz-msp-pp-mv-ospro-dukazni-doplneni",
  "parts":"slalom-2026-10-08-spolecne",
  "target":"documents/justice-slalom/2026-10/100-podani-2026-10-08-kpr-nsz-msp-ppr-mv-ospro.pdf",
  "sha":"9490a2cde83d76ec9b9fcf838df622e706725de651ed3b807a46e0f3b57fcda3",
  "size":156145,"pages":9,"part_count":5,
 },
]

def digest(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def reconstruct(spec:dict)->bytes:
    folder=TRANSPORT/spec["parts"]
    parts=sorted(folder.glob("part-*.xz.b64"))
    if len(parts)!=spec["part_count"]:
        raise SystemExit(f'{spec["id"]}: expected {spec["part_count"]} parts, found {len(parts)}')
    encoded="".join(p.read_text("ascii").strip() for p in parts)
    try:
        raw=lzma.decompress(base64.b64decode(encoded,validate=True))
    except Exception as exc:
        raise SystemExit(f'{spec["id"]}: cannot reconstruct original: {exc}')
    if len(raw)!=spec["size"] or digest(raw)!=spec["sha"]:
        raise SystemExit(f'{spec["id"]}: original size/SHA mismatch')
    if not raw.startswith(b"%PDF-") or b"%%EOF" not in raw[-2048:]:
        raise SystemExit(f'{spec["id"]}: reconstructed file is not a complete PDF')
    return raw

def main()->None:
    registry=json.loads(REGISTRY.read_text("utf-8"))
    docs={x["id"]:x for x in registry.get("documents",[])}
    for spec in SPECS:
        item=docs.get(spec["id"])
        if not item:
            raise SystemExit("Missing canonical record: "+spec["id"])
        public=item.get("public") or {}
        if public.get("pdf")!=spec["target"] or public.get("intended_pdf")!=spec["target"]:
            raise SystemExit("Target path mismatch: "+spec["id"])
        if public.get("sha256")!=spec["sha"] or public.get("source_original_sha256")!=spec["sha"]:
            raise SystemExit("Canonical SHA mismatch: "+spec["id"])
        if public.get("source_original_size_bytes")!=spec["size"] or public.get("source_original_page_count")!=spec["pages"]:
            raise SystemExit("Canonical source metadata mismatch: "+spec["id"])
        raw=reconstruct(spec)
        target=WEB/spec["target"]
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(raw)
        if digest(target.read_bytes())!=spec["sha"]:
            raise SystemExit("Written file SHA mismatch: "+spec["id"])
        print("MATERIALIZED ORIGINAL",spec["id"],spec["target"],spec["sha"])

if __name__=="__main__":
    main()
