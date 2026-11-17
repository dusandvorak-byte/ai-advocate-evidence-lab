#!/usr/bin/env python3
import base64, gzip, hashlib, json, os, re, runpy, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from publication_redaction import forbidden_public_identifiers
WEB = ROOT / "web"
PUBLICATION_ROOT = Path(os.environ.get("EVIDENCE_LAB_PUBLICATION_ROOT", str(WEB))).resolve()
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

def is_pdf_candidate(path: Path) -> bool:
    if not path.is_file():
        return False
    if path.suffix.lower() == ".pdf":
        return True
    try:
        return path.read_bytes()[:5] == b"%PDF-"
    except OSError:
        return False

def publication_pdf_paths(root: Path) -> list[Path]:
    return sorted((p for p in root.rglob("*") if is_pdf_candidate(p)), key=lambda p: p.as_posix().lower())

def file_attachment_annotation_count(doc) -> int:
    count = 0
    for page in doc:
        annots = page.annots()
        if not annots:
            continue
        for annot in annots:
            annot_type = annot.type
            code = annot_type[0] if isinstance(annot_type, (tuple, list)) and annot_type else None
            name = annot_type[1] if isinstance(annot_type, (tuple, list)) and len(annot_type) > 1 else str(annot_type)
            if code == 17 or name == "FileAttachment":
                count += 1
    return count

def associated_file_reference_count(doc) -> int:
    count = 0
    xrefs = []
    try:
        xrefs.append(doc.pdf_catalog())
    except Exception:
        pass
    for page in doc:
        try:
            xrefs.append(page.xref)
        except Exception:
            pass
    for xref in xrefs:
        if not xref:
            continue
        try:
            kind, value = doc.xref_get_key(xref, "AF")
        except Exception:
            continue
        if kind != "null" and str(value).strip() not in ("", "null", "[]"):
            count += 1
    return count

def pdf_facts(path: Path) -> dict:
    doc = fitz.open(path)
    fitz_text = "\n".join(page.get_text("text") for page in doc)
    poppler = subprocess.run(
        ["pdftotext", "-enc", "UTF-8", str(path), "-"],
        check=True, capture_output=True, text=True
    )
    poppler_text = poppler.stdout
    page_text = fitz_text + "\n" + poppler_text
    meta = {k: v for k, v in (doc.metadata or {}).items() if v}
    xmp = doc.get_xml_metadata() or ""
    embedded = doc.embfile_count() if hasattr(doc, "embfile_count") else 0
    file_attachment_annotations = file_attachment_annotation_count(doc)
    associated_file_references = associated_file_reference_count(doc)

    metadata_text = "\n".join(str(v) for v in meta.values())
    combined_private_scan = page_text + "\n" + metadata_text + "\n" + xmp
    private_hits = forbidden_public_identifiers(combined_private_scan)

    suspicious_re = re.compile(r"(?i)([\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|/Users/|/home/|[A-Z]:\\\\Users\\\\)")
    suspicious_metadata_keys = sorted(k for k, v in meta.items() if suspicious_re.search(str(v)))
    xmp_suspicious = bool(suspicious_re.search(xmp))

    signals = {
        "email_like_count": len(re.findall(r"(?i)\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", page_text)),
        "czech_birth_number_like_count": len(re.findall(r"(?<!\d)\d{6}/?\d{3,4}(?!\d)", page_text)),
        "phone_like_count": len(re.findall(r"(?<!\d)(?:\+420\s*)?(?:\d[ -]?){9}(?!\d)", page_text)),
    }
    page_count = doc.page_count
    doc.close()

    machine_failure = bool(embedded or file_attachment_annotations or associated_file_references or suspicious_metadata_keys or xmp_suspicious or private_hits)
    return {
        "page_count": page_count,
        "metadata_keys_present": sorted(meta.keys()),
        "embedded_file_count": embedded,
        "file_attachment_annotation_count": file_attachment_annotations,
        "associated_file_reference_count": associated_file_references,
        "suspicious_metadata_keys": suspicious_metadata_keys,
        "xmp_present": bool(xmp),
        "xmp_suspicious": xmp_suspicious,
        "xmp_known_private_identifier_hits": forbidden_public_identifiers(xmp),
        "content_privacy_signals": signals,
        "machine_privacy_status": (
            "FAIL_PRIVATE_OR_METADATA_CHANNEL" if machine_failure
            else ("FLAGGED_FOR_HUMAN_CONTENT_REVIEW" if any(signals.values()) else "NO_OBVIOUS_HIGH_RISK_PATTERN")
        ),
        "human_privacy_review_required": True,
        "known_private_identifier_hits": private_hits,
        "text_extraction_engines": ["PyMuPDF", "pdftotext/poppler"],
        "public_copy_notice_present": bool(re.search(r"(?i)(veřejn.{0,20}kopie|public pdf copy)", page_text)),
        "not_byte_identical_notice_present": bool(re.search(r"(?i)(nejde\s+o\s+byte[^\n]{0,20}identick|not\s+byte[^\n]{0,20}identical)", page_text)),
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
    if len(records) != 23:
        raise RuntimeError(f"expected 23 generated public derivatives after owner-approved ID 69 exclusion, found {len(records)}")
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
        if facts["embedded_file_count"] or facts["file_attachment_annotation_count"] or facts["associated_file_reference_count"] or facts["suspicious_metadata_keys"] or facts["xmp_suspicious"] or facts["xmp_known_private_identifier_hits"]:
            failures.append(f"unsafe metadata/embedded/XMP content in {target.relative_to(ROOT)}")
        if facts["known_private_identifier_hits"]:
            failures.append(
                f"known private identifier leaked into public derivative {target.relative_to(ROOT)}: "
                f"{facts['known_private_identifier_hits']}"
            )
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

def audit_registry_public_derivatives():
    registry_path = WEB / "data/documents-2026.json"
    registry = json.loads(registry_path.read_text("utf-8"))
    rows = []
    failures = []
    seen = set()
    markers = ("generated", "public_copy", "text_copy", "redacted", "not_byte_identical")
    for item in registry.get("documents", []):
        public = item.get("public") or {}
        rel = public.get("pdf")
        if not rel or rel in seen:
            continue
        status = " ".join([
            str(public.get("verification_status") or ""),
            str(public.get("public_copy_note") or ""),
            str(rel),
        ]).lower()
        filename_derivative = bool(re.search(r"(?i)(verejna|veřejná|textova|textová|redigovan|public[-_ ]?copy)", rel))
        if not filename_derivative and not any(marker in status for marker in markers):
            continue
        seen.add(rel)
        local = WEB / rel
        if not local.exists():
            failures.append(f"missing registry public derivative {rel}")
            continue
        facts = pdf_facts(local)
        checks = {
            "known_private_identifiers_absent": not facts["known_private_identifier_hits"],
            "embedded_files_absent": facts["embedded_file_count"] == 0,
            "file_attachment_annotations_absent": facts["file_attachment_annotation_count"] == 0,
            "associated_files_absent": facts["associated_file_reference_count"] == 0,
            "suspicious_metadata_absent": not facts["suspicious_metadata_keys"],
            "xmp_private_absent": not facts["xmp_known_private_identifier_hits"] and not facts["xmp_suspicious"],
        }
        if not all(checks.values()):
            failures.append(f"registry public derivative privacy failure {item.get('id')} {rel}: {checks}; hits={facts['known_private_identifier_hits']}")
        rows.append({
            "id": item.get("id"),
            "public_path": rel,
            "verification_status": public.get("verification_status"),
            "sha256": sha256_file(local),
            "page_count": facts["page_count"],
            "known_private_identifier_hits": facts["known_private_identifier_hits"],
            "machine_privacy_status": facts["machine_privacy_status"],
            "metadata_keys_present": facts["metadata_keys_present"],
            "xmp_present": facts["xmp_present"],
            "checks": checks,
        })
    if not rows:
        failures.append("no generated/redacted public derivatives discovered in final registry")
    return rows, failures

def audit_all_web_pdfs(root: Path = PUBLICATION_ROOT):
    registry_path = WEB / "data/documents-2026.json"
    registry = json.loads(registry_path.read_text("utf-8"))
    registry_by_path = {}
    derivative_paths = set()
    markers = ("generated", "public_copy", "text_copy", "redacted", "not_byte_identical")

    for item in registry.get("documents", []):
        public = item.get("public") or {}
        rel = str(public.get("pdf") or "")
        if not rel:
            continue
        registry_by_path.setdefault(rel, []).append({
            "id": item.get("id"),
            "verification_status": public.get("verification_status"),
        })
        status = " ".join([
            str(public.get("verification_status") or ""),
            str(public.get("public_copy_note") or ""),
            rel,
        ]).lower()
        if re.search(r"(?i)(verejna|veřejná|textova|textová|redigovan|public[-_ ]?copy)", rel) or any(marker in status for marker in markers):
            derivative_paths.add(rel)

    rows = []
    failures = []
    pdfs = publication_pdf_paths(root)
    if not pdfs:
        failures.append(f"no PDF-signature/suffix candidates found under publication root {root}")
        return rows, failures

    for path in pdfs:
        published_rel = path.relative_to(root).as_posix()
        compatibility_copy = root != WEB and published_rel.startswith("web/")
        source_rel = published_rel[4:] if compatibility_copy else published_rel
        facts = pdf_facts(path)
        refs = registry_by_path.get(source_rel, [])
        registered = bool(refs)
        is_derivative = source_rel in derivative_paths

        checks = {
            "forbidden_identifiers_absent": not facts["known_private_identifier_hits"],
            "embedded_files_absent": facts["embedded_file_count"] == 0,
            "file_attachment_annotations_absent": facts["file_attachment_annotation_count"] == 0,
            "associated_files_absent": facts["associated_file_reference_count"] == 0,
            "suspicious_info_metadata_absent": not facts["suspicious_metadata_keys"],
            "xmp_private_or_suspicious_absent": not facts["xmp_known_private_identifier_hits"] and not facts["xmp_suspicious"],
        }
        if is_derivative:
            checks["derivative_xmp_removed"] = not facts["xmp_present"]

        if not all(checks.values()):
            failures.append(f"final staged PDF privacy failure {published_rel}: {checks}")

        rows.append({
            "published_path": published_rel,
            "source_web_path": source_rel,
            "compatibility_copy": compatibility_copy,
            "registered": registered,
            "registry_ids": [ref.get("id") for ref in refs if ref.get("id")],
            "verification_statuses": [ref.get("verification_status") for ref in refs if ref.get("verification_status")],
            "derivative": is_derivative,
            "sha256": sha256_file(path),
            "page_count": facts["page_count"],
            "metadata_keys_present": facts["metadata_keys_present"],
            "xmp_present": facts["xmp_present"],
            "embedded_file_count": facts["embedded_file_count"],
            "file_attachment_annotation_count": facts["file_attachment_annotation_count"],
            "associated_file_reference_count": facts["associated_file_reference_count"],
            "machine_privacy_status": facts["machine_privacy_status"],
            "checks": checks,
        })

    return rows, failures


def audit_registry_reconciliation(staged_rows: list[dict]):
    canonical_path = ROOT / "project-memory/documents-2026.json"
    public_registry_path = WEB / "data/documents-2026.json"
    canonical = json.loads(canonical_path.read_text("utf-8"))
    public_registry = json.loads(public_registry_path.read_text("utf-8"))

    source_paths = {p.relative_to(WEB).as_posix() for p in publication_pdf_paths(WEB)}
    staged_paths = {row["published_path"] for row in staged_rows}
    failures = []

    canonical_pdf_paths = set()
    for item in canonical.get("documents", []):
        public = item.get("public") or {}
        rel = str(public.get("pdf") or "")
        if rel:
            canonical_pdf_paths.add(rel)

    expected_root_paths = source_paths | canonical_pdf_paths
    expected_staged_paths = expected_root_paths | {"web/" + rel for rel in expected_root_paths}

    stage_missing = sorted(expected_staged_paths - staged_paths)
    stage_extra = sorted(staged_paths - expected_staged_paths)
    if stage_missing:
        failures.append(f"staged publication PDF set is missing {len(stage_missing)} source/compatibility PDFs")
    if stage_extra:
        failures.append(f"staged publication PDF set has {len(stage_extra)} unexpected PDFs")

    canonical_refs = []
    canonical_by_path = {}
    for item in canonical.get("documents", []):
        public = item.get("public") or {}
        rel = str(public.get("pdf") or "")
        if not rel:
            continue
        row = {
            "id": item.get("id"),
            "path": rel,
            "verification_status": public.get("verification_status"),
            "present_in_source_web": rel in source_paths,
        }
        canonical_refs.append(row)
        canonical_by_path.setdefault(rel, []).append(row)

    public_refs = []
    for item in public_registry.get("documents", []):
        public = item.get("public") or {}
        rel = str(public.get("pdf") or "")
        if not rel:
            continue
        row = {
            "id": item.get("id"),
            "path": rel,
            "verification_status": public.get("verification_status"),
            "present_in_source_web": rel in source_paths,
            "present_in_staged_root": rel in staged_paths,
        }
        public_refs.append(row)
        if not row["present_in_staged_root"]:
            failures.append(f"final public registry references PDF absent from staged publication tree: {rel}")

    missing_canonical_paths = sorted(set(canonical_by_path) - source_paths)
    missing_rows = []
    for rel in missing_canonical_paths:
        refs = canonical_by_path[rel]
        statuses = sorted({str(ref.get("verification_status") or "") for ref in refs})
        present_root = rel in staged_paths
        present_mirror = ("web/" + rel) in staged_paths
        if present_root and present_mirror:
            classification = "restored_into_exact_staging"
        else:
            classification = "missing_from_exact_staging"
            failures.append(f"canonical PDF missing from exact staged publication tree: {rel}")
        missing_rows.append({
            "path": rel,
            "ids": [ref.get("id") for ref in refs if ref.get("id")],
            "verification_statuses": statuses,
            "classification": classification,
            "present_in_staged_root": present_root,
            "present_in_staged_web_mirror": present_mirror,
        })

    id69 = "doc-cz-pcr-krpt-2026-08-20-metodicko-odborne-vyjezdy-okte"
    id69_filename = "69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf"
    id69_present_canonical = any(item.get("id") == id69 for item in canonical.get("documents", []))
    id69_present_public_registry = any(item.get("id") == id69 for item in public_registry.get("documents", []))
    id69_present_source_or_stage = any(id69_filename in rel for rel in source_paths | staged_paths)
    if id69_present_canonical or id69_present_public_registry or id69_present_source_or_stage:
        failures.append("owner-excluded ID 69 is present in final canonical/public/staged release state")

    unregistered_source = sorted(source_paths - set(canonical_by_path))
    return {
        "canonical_registry_reference_count": len(canonical_refs),
        "canonical_registry_unique_pdf_count": len(canonical_by_path),
        "public_registry_reference_count": len(public_refs),
        "source_web_pdf_count": len(source_paths),
        "canonical_unique_pdf_count": len(canonical_pdf_paths),
        "expected_root_pdf_count": len(expected_root_paths),
        "staged_pdf_count": len(staged_paths),
        "expected_staged_pdf_count": len(expected_staged_paths),
        "staged_set_exact_match": not stage_missing and not stage_extra,
        "stage_missing_paths": stage_missing,
        "stage_extra_paths": stage_extra,
        "canonical_missing_from_source_count": len(missing_rows),
        "canonical_missing_from_source": missing_rows,
        "unregistered_source_pdf_count": len(unregistered_source),
        "unregistered_source_pdf_paths": unregistered_source,
        "id69_absent_from_final_release_state": not (id69_present_canonical or id69_present_public_registry or id69_present_source_or_stage),
    }, failures


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
    source_registry_path = ROOT / "project-memory/documents-2026-supplement-2026-11-04-reviewed-batch.json"
    final_registry_path = ROOT / "project-memory/documents-2026.json"
    hardening_path = ROOT / "project-memory/privacy-hardening-report.json"

    release = json.loads(release_path.read_text("utf-8"))
    source_registry = json.loads(source_registry_path.read_text("utf-8"))
    final_registry = json.loads(final_registry_path.read_text("utf-8"))
    hardening = json.loads(hardening_path.read_text("utf-8"))

    target_id = "doc-cz-dd-2026-11-03-okte-srovnavaci-analyza"
    privacy = next(x for x in release["privacy_documents"] if x["id"] == target_id)
    source_item = next(x for x in source_registry["documents"] if x["id"] == target_id)
    final_item = next(x for x in final_registry["documents"] if x["id"] == target_id)
    hardening_row = next((x for x in hardening.get("documents", []) if x.get("id") == target_id), None)
    local = WEB / final_item["public"]["pdf"]
    failures = []

    if not local.exists():
        return {"id": target_id, "missing": True}, [f"missing redacted public copy {local}"]
    if not hardening_row:
        return {"id": target_id, "hardening_missing": True}, [f"missing privacy hardening evidence for {target_id}"]

    facts = pdf_facts(local)
    actual = {
        "sha256": sha256_file(local),
        "size_bytes": local.stat().st_size,
        "page_count": facts["page_count"],
    }
    live = fetch_live(final_item["public"]["pdf"])
    checks = {
        "hardening_input_matches_reviewed_privacy_copy": hardening_row.get("input_sha256") == privacy["sha256"] == source_item["public"]["sha256"],
        "candidate_sha_matches_hardening_and_final_registry": actual["sha256"] == hardening_row.get("output_sha256") == final_item["public"]["sha256"],
        "candidate_pages_match_reviewed_copy": actual["page_count"] == privacy["page_count"] == source_item["public"]["source_original_page_count"],
        "hardening_changed_candidate": hardening_row.get("changed") is True,
        "hardening_removed_known_private_identifiers": not hardening_row.get("known_private_identifier_hits_after"),
        "historical_redactions_recorded": privacy.get("redaction_count", 0) > 0,
        "historical_outside_redaction_pixel_changes_zero": privacy.get("pixel_changes_outside_redactions") == 0,
        "historical_metadata_removal_recorded": privacy.get("metadata_removed") is True,
        "no_embedded_files_now": facts["embedded_file_count"] == 0,
        "no_file_attachment_annotations_now": facts["file_attachment_annotation_count"] == 0,
        "no_associated_files_now": facts["associated_file_reference_count"] == 0,
        "no_suspicious_metadata_now": not facts["suspicious_metadata_keys"],
        "no_private_xmp_now": not facts["xmp_known_private_identifier_hits"] and not facts["xmp_suspicious"],
        "xmp_removed_now": not facts["xmp_present"],
        "no_known_private_identifiers_now": not facts["known_private_identifier_hits"],
        "live_http_200_pre_release": live.get("http_status") == 200,
        "live_still_matches_pre_release_reviewed_copy": live.get("sha256") == privacy["sha256"],
    }
    if not all(checks.values()):
        failures.append(f"redacted analysis verification failed: {checks}")
    return {
        "id": target_id,
        "public_path": final_item["public"]["pdf"],
        "source_original_sha256": privacy["source_original_sha256"],
        "actual_candidate": actual,
        "privacy_manifest": privacy,
        "privacy_hardening": hardening_row,
        "current_pdf_metadata_keys": facts["metadata_keys_present"],
        "current_pdf_xmp_present": facts["xmp_present"],
        "current_content_privacy_signals": facts["content_privacy_signals"],
        "live_pre_release": live,
        "checks": checks,
        "human_privacy_review_required": True,
        "privacy_manifest_source": release_path.relative_to(ROOT).as_posix(),
        "privacy_hardening_source": hardening_path.relative_to(ROOT).as_posix(),
    }, failures

def main():
    generated, gen_fail = audit_generated()
    registry_derivatives, registry_fail = audit_registry_public_derivatives()
    all_web_pdfs, all_web_fail = audit_all_web_pdfs()
    reconciliation, reconciliation_fail = audit_registry_reconciliation(all_web_pdfs)
    hardening_path = ROOT / "project-memory/privacy-hardening-report.json"
    hardening = json.loads(hardening_path.read_text("utf-8"))
    hardening_fail = list(hardening.get("hard_failures") or [])
    if hardening.get("hard_failure_count") != len(hardening_fail):
        hardening_fail.append("privacy hardening failure count does not match hard failure list")
    okte, okte_fail = audit_okte()
    redacted, redact_fail = audit_redacted_analysis()
    failures = gen_fail + registry_fail + all_web_fail + reconciliation_fail + hardening_fail + okte_fail + redact_fail
    checkout_sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True
    ).stdout.strip()
    expected_head = os.environ.get("EXPECTED_HEAD_SHA", "").strip()
    expected_base = os.environ.get("EXPECTED_BASE_SHA", "").strip()
    expected_base_source = "workflow_event" if expected_base else "remote_main_derived"
    if expected_head and checkout_sha != expected_head:
        failures.append(f"checkout SHA {checkout_sha} != expected PR head {expected_head}")

    merge_base = None
    base_is_ancestor = None
    remote_main_sha = None
    remote = subprocess.run(
        ["git", "ls-remote", "origin", "refs/heads/main"],
        check=False, capture_output=True, text=True
    )
    if remote.returncode == 0 and remote.stdout.strip():
        remote_main_sha = remote.stdout.split()[0]
    else:
        failures.append("cannot verify current remote main SHA")

    # Non-PR triggers do not expose pull_request.base.sha. Derive the expected
    # base from the current remote main rather than silently skipping ancestry checks.
    if not expected_base:
        if remote_main_sha:
            expected_base = remote_main_sha
        else:
            failures.append("EXPECTED_BASE_SHA missing and remote main could not be derived")

    if expected_base:
        ancestor = subprocess.run(
            ["git", "merge-base", "--is-ancestor", expected_base, checkout_sha],
            capture_output=True, text=True
        )
        base_is_ancestor = ancestor.returncode == 0
        if not base_is_ancestor:
            failures.append(
                f"expected base {expected_base} is not an ancestor of checkout {checkout_sha}"
            )
        merge = subprocess.run(
            ["git", "merge-base", expected_base, checkout_sha],
            check=False, capture_output=True, text=True
        )
        merge_base = merge.stdout.strip() or None
        if merge.returncode != 0 or merge_base != expected_base:
            failures.append(
                f"merge-base mismatch: expected {expected_base}, got {merge_base or 'none'}"
            )
        if remote_main_sha and remote_main_sha != expected_base:
            failures.append(
                f"main advanced during validation: expected {expected_base}, remote main is {remote_main_sha}"
            )

    report = {
        "schema_version": "1.0",
        "scope": "nonpublishing integration evidence for PR #183 + #184 + #185",
        "checkout_commit": checkout_sha,
        "expected_pr_head_commit": expected_head or None,
        "expected_base_commit": expected_base or None,
        "expected_base_source": expected_base_source,
        "base_is_ancestor": base_is_ancestor,
        "merge_base_commit": merge_base,
        "remote_main_commit": remote_main_sha,
        "github_event_sha": os.environ.get("GITHUB_SHA"),
        "generated_public_derivatives": generated,
        "registry_public_derivatives": registry_derivatives,
        "all_final_web_pdfs": all_web_pdfs,
        "registry_web_stage_reconciliation": reconciliation,
        "privacy_hardening": hardening,
        "okte_originals": okte,
        "redacted_okte_analysis": redacted,
        "summary": {
            "generated_derivative_count": len(generated),
            "registry_public_derivative_count": len(registry_derivatives),
            "all_final_staged_pdf_count": len(all_web_pdfs),
            "source_web_pdf_count": reconciliation.get("source_web_pdf_count"),
            "canonical_registry_reference_count": reconciliation.get("canonical_registry_reference_count"),
            "canonical_missing_from_source_count": reconciliation.get("canonical_missing_from_source_count"),
            "unregistered_source_pdf_count": reconciliation.get("unregistered_source_pdf_count"),
            "staged_set_exact_match": reconciliation.get("staged_set_exact_match"),
            "id69_absent_from_final_release_state": reconciliation.get("id69_absent_from_final_release_state"),
            "privacy_hardened_derivative_count": hardening.get("changed_derivative_count"),
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
