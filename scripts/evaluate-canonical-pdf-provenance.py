#!/usr/bin/env python3
import json, re, subprocess, tempfile
from pathlib import Path
import fitz

ROOT=Path(__file__).resolve().parents[1]
CANDIDATES=ROOT/"review-artifacts"/"canonical-pdf-sha-candidates.json"
REGISTRY=ROOT/"project-memory"/"documents-2026.json"
OUT=ROOT/"review-artifacts"/"canonical-pdf-provenance-evaluation.json"

def norm(s):
    s=str(s or "").lower()
    table=str.maketrans("áčďéěíňóřšťúůýž","acdeeinorstuuyz")
    s=s.translate(table)
    return re.sub(r"[^a-z0-9]+"," ",s).strip()

def ref_tokens(ref):
    toks=[t for t in norm(ref).split() if len(t)>=2 or t.isdigit()]
    return toks

def gh_bytes(rel):
    for candidate in (rel,"web/"+rel):
        p=subprocess.run(["git","show",f"origin/gh-pages:{candidate}"],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        if p.returncode==0:
            return p.stdout
    return None

registry=json.loads(REGISTRY.read_text("utf-8"))
by_id={x.get("id"):x for x in registry.get("documents",[])}
cand=json.loads(CANDIDATES.read_text("utf-8"))
rows=[]
for item in cand.get("items",[]):
    doc=by_id.get(item["id"]) or {}
    rel=item["pdf"]
    path=ROOT/"web"/rel
    data=path.read_bytes() if path.is_file() else gh_bytes(rel)
    text=""
    pages=None
    parse_ok=False
    if data and data.startswith(b"%PDF-"):
        try:
            pdf=fitz.open(stream=data,filetype="pdf")
            pages=pdf.page_count
            text="\n".join(p.get_text("text") for p in pdf)
            pdf.close()
            parse_ok=True
        except Exception:
            pass
    ntext=norm(text)
    toks=ref_tokens(doc.get("reference"))
    matched=[t for t in toks if t in ntext]
    ratio=(len(matched)/len(toks)) if toks else 0
    content_ref_match=bool(toks and len(matched)>=min(2,len(toks)) and ratio>=0.6)
    explicit=item.get("provenance_strength")=="EXPLICIT_PROJECT_MANIFEST"
    continuity=bool(item.get("continuity_match"))
    source_sha=bool(re.fullmatch(r"[0-9a-fA-F]{64}",str(item.get("source_sha256") or "")))
    if explicit and continuity and content_ref_match:
        recommendation="PROMOTABLE_PUBLIC_BYTE_IDENTITY"
    elif explicit and source_sha and content_ref_match:
        recommendation="SOURCE_BACKED_DERIVATIVE_REVIEW"
    elif continuity and content_ref_match:
        recommendation="CONTINUITY_PLUS_CONTENT_NEEDS_SOURCE_PROOF"
    else:
        recommendation="NEEDS_MANUAL_PROVENANCE"
    rows.append({
        "id":item["id"],
        "pdf":rel,
        "measured_sha256":item.get("measured_sha256"),
        "measured_from":item.get("measured_from"),
        "provenance_strength":item.get("provenance_strength"),
        "source_manifest":item.get("source_manifest"),
        "source_sha256_present":source_sha,
        "continuity_match":continuity,
        "pdf_parse_ok":parse_ok,
        "page_count":pages,
        "reference_token_count":len(toks),
        "reference_token_match_count":len(matched),
        "reference_token_match_ratio":round(ratio,3),
        "content_reference_match":content_ref_match,
        "recommendation":recommendation
    })

OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps({
    "schema_version":"1.0",
    "purpose":"Non-sensitive evidence assessment for public PDF SHA provenance. No PDF text is emitted.",
    "count":len(rows),
    "summary":{},
    "items":rows
},ensure_ascii=False,indent=2)+"\n","utf-8")
summary={}
for r in rows:
    summary[r["recommendation"]]=summary.get(r["recommendation"],0)+1
obj=json.loads(OUT.read_text("utf-8")); obj["summary"]=summary
OUT.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n","utf-8")
print(json.dumps(summary))
