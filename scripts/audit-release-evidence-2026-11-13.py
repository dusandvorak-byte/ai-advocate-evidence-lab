#!/usr/bin/env python3
import base64, gzip, hashlib, json, re, runpy, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import fitz

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT = ROOT / "review-artifacts" / "release-evidence-audit.json"
LIVE_BASE = "https://dusandvorak-byte.github.io/ai-advocate-evidence-lab/"

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())

def source_text(path: Path) -> str:
    if path.name.endswith(".txt.gz.b64"):
        return gzip.decompress(base64.b64decode(path.read_text("ascii").strip())).decode("utf-8")
    try:
        return path.read_text("utf-8")
    except UnicodeDecodeError:
        return ""

def pdf_facts(path: Path) -> dict:
    doc = fitz.open(path)
    text = "\n".join(page.get_text("text") for page in doc)
    meta = {k: v for k, v in (doc.metadata or {}).items() if v}
    embedded = doc.embfile_count() if hasattr(doc, "embfile_count") else 0
    suspicious_meta = {
        k: v for k, v in meta.items()
        if re.search(r"(?i)([\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|/Users/|/home/|[A-Z]:\\\\Users\\\\)", str(v))
    }
    signals = {
        "email_like_count": len(re.findall(r"(?i)\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", text)),
        "czech_birth_number_like_count": len(re.findall(r"(?<!\d)\d{6}/?\d{3,4}(?!\d)", text)),
        "phone_like_count": len(re.findall(r"(?<!\d)(?:\+420\s*)?(?:\d[ -]?){9}(?!\d)", text)),
    }
    return {
        "page_count": doc.page_count,
        "metadata": meta,
        "embedded_file_count": embedded,
        "suspicious_metadata": suspicious_meta,
        "content_privacy_signals": signals,
        "machine_privacy_status": (
            "FAIL_EMBEDDED_OR_SUSPICIOUS_METADATA" if embedded or suspicious_meta
            else ("FLAGGED_FOR_HUMAN_CONTENT_REVIEW" if any(signals.values()) else "NO_OBVIOUS_HIGH_RISK_PATTERN")
        ),
        "human_privacy_review_required": True,
        "public_copy_notice_present": bool(re.search(r"(?i)(veřejn.{0,12}kopie|public pdf copy)", text)),
        "not_byte_identical_notice_present": bool(re.search(r"(?i)(nejde o byte-identick|not byte-identical)", text)),
    }

def load_generator_records():
    records = []
    defs = [
        "scripts/materialize-godot-state-text-pdfs.py",
        "scripts/materialize-godot-late-state-pdfs.py",
        "scripts/materialize-uoou-2026-08-26.py",
        "scripts/materialize-euda-2026-09-25.py",
    ]
    for script in defs:
        ns = runpy.run_path(str(ROOT / script), run_name=f"audit_{Path(script).stem}")
        if "SOURCES" in ns:
            for filename, sources in ns["SOURCES"].items():
                records.append((script, list(sources), ns["OUT"] / filename, None))
        elif script.endswith("late-state-pdfs.py"):
            for item in ns["ITEMS"]:
                records.append((script, [item["source"]], ns["OUT"] / item["filename"], None))
        elif script.endswith("uoou-2026-08-26.py"):
            for item in ns["ITEMS"]:
                records.append((script, [item["source"]], ns["OUT"] / item["target"], None))
        else:
            records.append((script, [ns["SOURCE"]], ns["TARGET"], ns.get("ORIGINAL_SHA256")))
    if len(records) != 24:
        raise RuntimeError(f"expected 24 generated public derivatives, found {len(records)}")
    return records

def audit_generated():
    out = []
    failures = []
    for generator, sources, target, declared_original_sha in load_generator_records():
        if not target.exists():
            failures.append(f"missing generated PDF {target.relative_to(ROOT)}")
            continue
        source_rows = []
        declared_hashes = set()
        for src in sources:
            if not src.exists():
                failures.append(f"missing versioned source {src.relative_to(ROOT)}")
                continue
            txt = source_text(src)
            declared_hashes.update(re.findall(r"(?i)\b[0-9a-f]{64}\b", txt))
            source_rows.append({
                "path": src.relative_to(ROOT).as_posix(),
                "sha256": sha256_file(src),
                "size_bytes": src.stat().st_size,
            })
        facts = pdf_facts(target)
        if not facts["public_copy_notice_present"]:
            failures.append(f"missing public-copy notice in {target.relative_to(ROOT)}")
        if not facts["not_byte_identical_notice_present"]:
            failures.append(f"missing not-byte-identical notice in {target.relative_to(ROOT)}")
        if facts["embedded_file_count"] or facts["suspicious_metadata"]:
            failures.append(f"unsafe metadata/embedded content in {target.relative_to(ROOT)}")
        out.append({
            "output": target.relative_to(ROOT).as_posix(),
            "generator": generator,
            "source_files": source_rows,
            "declared_original_sha256s_in_source_text": sorted(declared_hashes),
            "generator_declared_original_sha256": declared_original_sha,
            "output_sha256": sha256_file(target),
            "output_size_bytes": target.stat().st_size,
            **facts,
        })
    return out, failures

def fetch_live(path: str, tries: int = 3):
    url = LIVE_BASE + path
    last = None
    for attempt in range(tries):
        try:
            req = Request(url, headers={"User-Agent": "EvidenceLabReleaseAudit/1.0"})
            with urlopen(req, timeout=20) as resp:
                data = resp.read()
                return {"url": url, "http_status": resp.status, "sha256": sha256_bytes(data), "size_bytes": len(data)}
        except (HTTPError, URLError, TimeoutError) as exc:
            last = str(exc)
            time.sleep(1 + attempt)
    return {"url": url, "http_status": None, "error": last}

def audit_okte():
    annex_path = ROOT / "project-memory/documents-2026-supplement-2026-11-05-okte-olomouc-attachments.json"
    parent_path = ROOT / "project-memory/documents-2026-supplement-2026-11-02-late-october.json"
    transcript_path = ROOT / "project-memory/source-transcripts/2026-11-02-krpm-pages.json"
    annexes = json.loads(annex_path.read_text("utf-8"))["documents"]
    parents = json.loads(parent_path.read_text("utf-8"))["documents"]
    parent = next(x for x in parents if x["id"] == "doc-cz-pcr-krpo-2026-10-30-krpm-145410-2")
    transcript = json.loads(transcript_path.read_text("utf-8"))
    transcript_text = "\n".join(transcript.get("pages", []))
    support = {
        "transcript_path": transcript_path.relative_to(ROOT).as_posix(),
        "transcript_sha256": sha256_file(transcript_path),
        "contains_reference": "KRPM-145410-2/ČJ-2026-1400AP-106" in transcript_text,
        "contains_attachment_count_10": "Počet příloh: 10x soubor" in transcript_text,
        "parent_relation_count": len([r for r in parent.get("relations", []) if r.get("type") == "priloha"]),
        "annex_registry_count": len(annexes),
        "evidence_note": parent.get("evidence_note"),
    }
    failures = []
    if not all([support["contains_reference"], support["contains_attachment_count_10"], support["parent_relation_count"] == 10, support["annex_registry_count"] == 10]):
        failures.append("parent evidence support for ten attachments is incomplete")
    rows = []
    for item in annexes:
        pub = item["public"]
        rel = pub["pdf"]
        local = WEB / rel
        if not local.exists():
            failures.append(f"missing local OKTE original {rel}")
            continue
        local_sha = sha256_file(local)
        facts = pdf_facts(local)
        expected = pub["sha256"]
        source_expected = pub["source_original_sha256"]
        live = fetch_live(rel)
        checks = {
            "registry_public_equals_source_original": expected == source_expected,
            "local_sha_matches_registry": local_sha == expected,
            "local_page_count_matches_registry": facts["page_count"] == pub["source_original_page_count"],
            "live_http_200": live.get("http_status") == 200,
            "live_sha_matches_registry": live.get("sha256") == expected,
        }
        if not all(checks.values()):
            failures.append(f"OKTE verification failed for {item['id']}: {checks}")
        rows.append({
            "id": item["id"],
            "reference": item.get("reference"),
            "public_path": rel,
            "expected_sha256": expected,
            "source_original_sha256": source_expected,
            "local_sha256": local_sha,
            "page_count": facts["page_count"],
            "expected_page_count": pub["source_original_page_count"],
            "live": live,
            "checks": checks,
        })
    return {"parent_evidence_support": support, "annexes": rows}, failures

def audit_redacted_analysis():
    release_path = ROOT / "project-memory/evidence-release-2026-11-04.json"
    registry_path = ROOT / "project-memory/documents-2026-supplement-2026-11-04-reviewed-batch.json"
    release = json.loads(release_path.read_text("utf-8"))
    registry = json.loads(registry_path.read_text("utf-8"))
    target_id = "doc-cz-dd-2026-11-03-okte-srovnavaci-analyza"
    privacy = next(x for x in release["privacy_documents"] if x["id"] == target_id)
    item = next(x for x in registry["documents"] if x["id"] == target_id)
    local = WEB / item["public"]["pdf"]
    failures = []
    if not local.exists():
        return {"id": target_id, "missing": True}, [f"missing redacted public copy {local}"]
    facts = pdf_facts(local)
    actual = {
        "sha256": sha256_file(local),
        "size_bytes": local.stat().st_size,
        "page_count": facts["page_count"],
    }
    live = fetch_live(item["public"]["pdf"])
    checks = {
        "actual_sha_matches_privacy_manifest": actual["sha256"] == privacy["sha256"] == item["public"]["sha256"],
        "actual_size_matches_privacy_manifest": actual["size_bytes"] == privacy["size_bytes"] == item["public"]["source_public_size_bytes"],
        "actual_pages_match_privacy_manifest": actual["page_count"] == privacy["page_count"] == item["public"]["source_original_page_count"],
        "redactions_recorded": privacy.get("redaction_count", 0) > 0,
        "outside_redaction_pixel_changes_zero": privacy.get("pixel_changes_outside_redactions") == 0,
        "metadata_removal_recorded": privacy.get("metadata_removed") is True,
        "no_embedded_files_now": facts["embedded_file_count"] == 0,
        "no_suspicious_metadata_now": not facts["suspicious_metadata"],
        "live_http_200": live.get("http_status") == 200,
        "live_sha_matches_manifest": live.get("sha256") == privacy["sha256"],
    }
    if not all(checks.values()):
        failures.append(f"redacted analysis verification failed: {checks}")
    return {
        "id": target_id,
        "public_path": item["public"]["pdf"],
        "source_original_sha256": privacy["source_original_sha256"],
        "actual": actual,
        "privacy_manifest": privacy,
        "current_pdf_metadata": facts["metadata"],
        "current_content_privacy_signals": facts["content_privacy_signals"],
        "live": live,
        "checks": checks,
        "human_privacy_review_required": True,
        "privacy_manifest_source": release_path.relative_to(ROOT).as_posix(),
    }, failures

def main():
    generated, gen_fail = audit_generated()
    okte, okte_fail = audit_okte()
    redacted, redact_fail = audit_redacted_analysis()
    failures = gen_fail + okte_fail + redact_fail
    report = {
        "schema_version": "1.0",
        "scope": "nonpublishing integration evidence for PR #183 + #184 + #185",
        "commit": __import__("os").environ.get("GITHUB_SHA"),
        "generated_public_derivatives": generated,
        "okte_originals": okte,
        "redacted_okte_analysis": redacted,
        "summary": {
            "generated_derivative_count": len(generated),
            "okte_original_count": len(okte.get("annexes", [])),
            "hard_failure_count": len(failures),
            "hard_failures": failures,
            "human_content_privacy_review_still_required": True,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))
    print(f"RELEASE EVIDENCE AUDIT REPORT {OUT.relative_to(ROOT)}")
    if failures:
        raise SystemExit("\n".join(failures))

if __name__ == "__main__":
    main()
