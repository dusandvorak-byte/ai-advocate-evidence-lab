#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json
from pathlib import Path
import fitz

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/"web"

def fail(msg:str):
    raise SystemExit("REDACTED-ORIGINALS-2026-10-16: "+msg)

def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def text_of(path:Path):
    doc=fitz.open(path)
    text="\n".join(page.get_text("text") for page in doc)
    pages=doc.page_count
    images=sum(len(page.get_images(full=True)) for page in doc)
    doc.close()
    return text,pages,images

supp12=json.loads((ROOT/"project-memory/documents-2026-supplement-2026-10-12-justice-slalom.json").read_text("utf-8"))
supp15=json.loads((ROOT/"project-memory/documents-2026-supplement-2026-10-15-godot-slalom.json").read_text("utf-8"))
docs={d["id"]:d for d in supp12["documents"]+supp15["documents"]}
ids=[
 "doc-cz-dd-2026-10-12-osz-os-pro-infz-thc-obnova",
 "doc-cz-ekk-2026-10-15-pcr-krpo-krpt-gibs-infz-tp",
 "doc-cz-dd-2026-10-15-eu-ombudsman-202602199-first-supplement"
]
for did in ids:
    d=docs.get(did)
    if not d: fail("missing "+did)
    if d["justice_slalom"].get("source_kind")!="redacted_original_from_user_binary":
        fail("wrong source kind "+did)
    if not d["public"]["pdf"].endswith("-redigovany-original.pdf"):
        fail("wrong public path "+did)
    b=(WEB/d["public"]["pdf"]).read_bytes()
    if not b.startswith(b"%PDF-") or b"%%EOF" not in b[-4096:] or sha(b)!=d["public"]["sha256"] or sha(b)!=d["justice_slalom"]["public_sha256"]:
        fail("PDF integrity "+did)
    if not d["justice_slalom"].get("redaction_manifest"):
        fail("missing redaction manifest "+did)

# 12 Oct - preserve full names of statutory/supervisory persons, reduce other private identity.
d=docs[ids[0]]
txt,pages,images=text_of(WEB/d["public"]["pdf"])
flat=" ".join(txt.split())
if pages!=6: fail("12 Oct page count")
for forbidden in ["12. ledna 1962","798 55 Ospělov 6","r8u3nhx","Mgr. Vandy Dvořákové","8.6.1987","18.5.1963","10.4.1936","20.3.1939"]:
    if forbidden in flat: fail("12 Oct sensitive value remains: "+forbidden)
for required in ["Mgr. Dušan Dvořák","Mgr. Radomíry Dvořákové","Mgr. Vandy D.","Ing. Františka Dvořáka","Jany Dvořákové","nar. 1963","nar. 1987","nar. 1936","nar. 1939"]:
    if required not in flat: fail("12 Oct required redacted form missing: "+required)

# 15 Oct police - all statutory/supervisory full names; dates reduced to years; private nonstat surnames initials.
d=docs[ids[1]]
txt,pages,images=text_of(WEB/d["public"]["pdf"])
flat=" ".join(txt.split())
if pages!=19: fail(f"police page count {pages}, expected 19")
if images<2: fail("police historical scans missing")
for forbidden in [
 "12. 1. 1962","79855 Ospělov 6","798 55 Ospělov 6","r8u3nhx",
 "Mgr. Petr Ladislav Kodym","Olga Novotná","Jarmila Honkýšová",
 "7. 11. 1963","18. 5. 1963","2. 8. 1968","7. 2. 1952","25. 3. 1979","12. 2. 1972","3. 7. 1982","26. 5. 1962","5. 1. 1965","23.3.1957","29. 4. 1979","20. 9. 1956","27. 3. 1981","31. 10. 1957","21. 5. 1954","10. 4. 1943","10. 4. 1936","20. 3. 1939"
]:
    if forbidden in flat: fail("police sensitive value remains: "+forbidden)
for required in [
 "Ing. Oto Kaděrka","Mgr. Radomíra Dvořáková","Mgr. Robert Nováček","Mgr. Luboš Smékal","MUDr. Jana Budařová",
 "MUDr. Radek Matlach","Ing. Juraj Kořínek","MUDr. Irina Hubeňáková","MUDr. Aleš Skřivánek, Ph.D.","Miloslav Tetour",
 "Bc. Jakub Balabán","Mgr. Zbyněk Kopřiva","Bc. Jan Marie Bém","Hana Barešová","Mgr. Jaroslav Kabilka","JUDr. Ludvík Antonů","Ing. František Dvořák",
 "Mgr. Petr Ladislav K.","Olga N.","Jarmila H.","1962","1963","1954","1943","1936"
]:
    if required not in flat: fail("police required form missing: "+required)

# Ombudsman - preserve original filing text/layout while removing private contact coordinates.
d=docs[ids[2]]
txt,pages,images=text_of(WEB/d["public"]["pdf"])
flat=" ".join(txt.split())
if pages!=13: fail("ombudsman page count")
for forbidden in ["Ospělov 6, 798 55","DusanDvorak@seznam.cz","pavel.bem@gmail.com","voboril@podaneruce.cz","mravcik@podaneruce.cz","trojanv@psp.cz"]:
    if forbidden in flat: fail("ombudsman private contact remains: "+forbidden)
for required in ["Mgr. Dušan Dvořák","Ospělov, Czech Republic","Complaint No. 202602199","Pavel B."]:
    if required not in flat: fail("ombudsman required form missing: "+required)

print("Redigované originály 12./15. 10. 2026 OK: roky narození, statutární/dozorčí osoby, obec/město, původní vzhled a historická příloha 2014.")
