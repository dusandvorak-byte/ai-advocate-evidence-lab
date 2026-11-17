#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

from provenance_manifest import manifest_binds_digest
from canonical_pdf_provenance_contract import validate_frozen_provenance_binding

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "project-memory" / "documents-2026.json"
CONTRACT = ROOT / "project-memory" / "canonical-pdf-provenance-contract.json"
EXPECTED_REMEDIATED_IDS = {
    "doc-cz-ct-2026-06-01-ct-338889-2025-38",
    "doc-cz-dd-2026-08-10-reakce-18-a-23-2026",
    "doc-cz-kpr-2026-06-05-kpr-4093-2026",
    "doc-cz-kpr-2026-07-30-kpr-5772-2026-1",
    "doc-cz-kpr-2026-08-03-kpr-5080-2026",
    "doc-cz-kpr-2026-08-07-kpr-5772-2026-2",
    "doc-cz-ksz-brn-2026-07-21-1-kzt-475-2026-32",
    "doc-cz-ksz-brn-2026-07-31-1-kzn-1079-2026-14",
    "doc-cz-ksz-ost-2026-07-29-4-kzn-7116-2026-50",
    "doc-cz-mk-2026-07-22-mk-45728-2026-socns",
    "doc-cz-ms-pha-2026-08-10-18-a-23-2026-130",
    "doc-cz-ms-pha-2026-08-10-18-a-23-2026-131",
    "doc-cz-ms-pha-2026-09-09-8-ad-9-2026-89",
    "doc-cz-ms-pha-2026-09-14-9-ad-12-2026-7",
    "doc-cz-ms-pha-2026-09-22-15-ad-14-2026-12",
    "doc-cz-ms-pha-2026-09-23-18-a-17-2026-182",
    "doc-cz-ms-pha-2026-09-23-18-a-23-2026-182",
    "doc-cz-msp-2026-06-03-msp-19-2026-odka-roz-7",
    "doc-cz-msp-2026-08-27-msp-19-2026-odka-roz-26",
    "doc-cz-msz-brn-2026-07-14-sin-15-2026-5",
    "doc-cz-msz-brn-2026-07-21-3-zn-140-2026-3",
    "doc-cz-msz-pha-2026-06-11-3-kzn-197-2026-12",
    "doc-cz-msz-pha-2026-06-17-3-kzn-197-2026-18",
    "doc-cz-msz-pha-2026-07-30-sin-48-2026-12",
    "doc-cz-mv-2026-07-15-mv-108890-3-tp-2026",
    "doc-cz-mv-2026-07-16-mv-97289-3-tp-2026",
    "doc-cz-mv-2026-07-21-mv-114818-2-tp-2026",
    "doc-cz-mv-2026-09-14-mv-139593-3-tp-2026",
    "doc-cz-mz-2026-05-29-mzdr-13429-2026-3-olzp",
    "doc-cz-nsz-2026-07-30-sin-55-2026-19",
    "doc-cz-os-pro-2026-08-07-15-nt-3105-2026-54",
    "doc-cz-osz-pha2-2026-07-30-1-zn-157-2026-33",
    "doc-cz-osz-pha7-2026-07-28-zn-87-2026-47",
    "doc-cz-osz-pro-2026-07-28-zn-4-2026-6",
    "doc-cz-pcr-krpt-2026-08-05-krpt-203594-3-cj-2026-0700kr",
    "doc-cz-pcr-ku-2026-06-25-ku-4139-5-cj-2026-2305km",
    "doc-cz-pcr-ncoz-2026-05-22-ncoz-4324-2-cj-2026-4100pi",
    "doc-cz-pcr-ncoz-2026-06-01-ncoz-4324-4-cj-2026-4100pi",
    "doc-cz-pcr-ncoz-2026-06-15-ncoz-4871-5-cj-2026-410066-e",
    "doc-cz-pcr-pp-2026-05-22-ppr-24960-8-cj-2026-990810",
    "doc-cz-rrtv-2026-07-16-rrtv-7757-2026-fej",
    "doc-cz-uoou-2026-07-28-uoou-05058-26-2",
    "doc-cz-uoou-2026-07-28-uoou-05093-26-2",
    "doc-cz-vsz-olo-2026-09-15-3-vzn-239-2026-64",
    "doc-cz-vsz-pha-2026-06-22-1-vzn-1678-2026-8",
    "doc-cz-vsz-pha-2026-07-23-1-vzn-1678-2026-70",
}

ALLOWED = {
    "binding-manifest-exact-digest-verified",
    "historical-introduction-and-blob-continuity-verified",
    "historical-origin-restoration-and-blob-continuity-verified",
    "deterministic-generated-public-copy-verified",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def git_show(commit: str, path: str) -> bytes:
    proc = subprocess.run(
        ["git", "show", f"{commit}:{path}"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    if proc.returncode != 0:
        raise RuntimeError(f"cannot read provenance bytes {commit}:{path}")
    return proc.stdout


registry = json.loads(REGISTRY.read_text("utf-8"))
contract = json.loads(CONTRACT.read_text("utf-8"))
checked = []
failures = []

if contract.get("schema_version") != 1 or contract.get("contract_id") != "evidence-lab-canonical-pdf-provenance-v1":
    failures.append("canonical provenance contract identity/schema mismatch")
if contract.get("record_count") != 46 or len(contract.get("records") or []) != 46:
    failures.append("canonical provenance contract must contain exactly 46 records")

contract_by_id = {row.get("id"): row for row in contract.get("records", [])}
if set(contract_by_id) != EXPECTED_REMEDIATED_IDS:
    failures.append("canonical provenance contract ID set differs from expected 46-record set")

registry_by_id = {item.get("id"): item for item in registry.get("documents", [])}
missing_expected = sorted(EXPECTED_REMEDIATED_IDS - set(registry_by_id))
if missing_expected:
    failures.append(f"expected remediated records missing from registry: {missing_expected}")

for expected_id in sorted(EXPECTED_REMEDIATED_IDS):
    item = registry_by_id.get(expected_id)
    expected = contract_by_id.get(expected_id)
    if not item or not expected:
        continue
    public = item.get("public") or {}
    if not public.get("sha256_provenance") or not public.get("sha256_provenance_status"):
        failures.append(f"{expected_id}: required provenance annotation missing")
        continue
    failures.extend(validate_frozen_provenance_binding(expected, item))

for item in registry.get("documents", []):
    public = item.get("public") or {}
    rel = str(public.get("pdf") or "")
    provenance = str(public.get("sha256_provenance") or "")
    if not rel or not provenance:
        continue

    sha = str(public.get("sha256") or "").lower()
    status = str(public.get("sha256_provenance_status") or "")
    expected = contract_by_id.get(item.get("id"))
    if not expected:
        failures.append(f"{item.get('id')}: provenance record is not present in frozen contract")
        continue
    evidence_contract = expected.get("evidence") or {}
    if rel != expected.get("path") or status != expected.get("status"):
        failures.append(f"{item.get('id')}: path/status differs from frozen provenance contract")
        continue
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        failures.append(f"{item.get('id')}: invalid canonical SHA")
        continue
    if status not in ALLOWED:
        failures.append(f"{item.get('id')}: unsupported provenance status {status!r}")
        continue

    ok = False
    evidence = None
    if status == "binding-manifest-exact-digest-verified":
        manifest = public.get("source_manifest")
        expected_manifest = evidence_contract.get("manifest")
        expected_manifest_blob = str(evidence_contract.get("manifest_git_blob_sha") or "")
        if evidence_contract.get("type") != "manifest" or manifest != expected_manifest:
            failures.append(f"{item.get('id')}: binding manifest differs from frozen contract")
            continue
        manifest_proc = subprocess.run(["git", "hash-object", manifest], cwd=ROOT, capture_output=True, text=True)
        manifest_blob = manifest_proc.stdout.strip() if manifest_proc.returncode == 0 else ""
        if manifest_blob != expected_manifest_blob:
            failures.append(f"{item.get('id')}: binding manifest content differs from frozen reviewed blob")
            continue
        ok = manifest_binds_digest(ROOT, manifest, item.get("id"), rel, sha)
        evidence = f"{manifest}@gitblob:{manifest_blob}"

    elif status in {
        "historical-introduction-and-blob-continuity-verified",
        "historical-origin-restoration-and-blob-continuity-verified",
    }:
        if evidence_contract.get("type") != "historical_commit":
            failures.append(f"{item.get('id')}: historical evidence type differs from frozen contract")
            continue
        commit = str(evidence_contract.get("commit") or "")
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            failures.append(f"{item.get('id')}: frozen historical commit is invalid")
            continue
        if commit not in provenance:
            failures.append(f"{item.get('id')}: provenance text no longer names frozen historical commit")
            continue
        historical = git_show(commit, "web/" + rel)
        current_path = ROOT / "web" / rel
        if not current_path.is_file():
            failures.append(f"{item.get('id')}: current web PDF missing for historical provenance")
            continue
        historical_sha = sha256_bytes(historical)
        current_sha = sha256_file(current_path)
        ok = historical_sha == sha and current_sha == sha
        evidence = commit

    elif status == "deterministic-generated-public-copy-verified":
        if evidence_contract.get("type") != "deterministic_generator":
            failures.append(f"{item.get('id')}: deterministic evidence type differs from frozen contract")
            continue
        generator_rel = str(evidence_contract.get("generator") or "")
        generator = ROOT / generator_rel
        output_name = str(evidence_contract.get("output_name") or "")
        expected_blob = str(evidence_contract.get("generator_git_blob_sha") or "")
        source_rel = str(evidence_contract.get("source_path") or "")
        expected_source_blob = str(evidence_contract.get("source_git_blob_sha") or "")
        if Path(rel).name != output_name:
            failures.append(f"{item.get('id')}: generated output name differs from frozen contract")
            continue
        if not generator.is_file() or output_name not in generator.read_text("utf-8"):
            failures.append(f"{item.get('id')}: output is not a member of the frozen deterministic generator")
            continue
        if not source_rel or not expected_source_blob:
            failures.append(f"{item.get('id')}: deterministic source is not pinned in frozen contract")
            continue
        source_proc = subprocess.run(["git", "hash-object", source_rel], cwd=ROOT, capture_output=True, text=True)
        source_blob = source_proc.stdout.strip() if source_proc.returncode == 0 else ""
        if source_blob != expected_source_blob:
            failures.append(f"{item.get('id')}: deterministic source bytes differ from frozen reviewed blob")
            continue
        blob_proc = subprocess.run(["git", "hash-object", generator_rel], cwd=ROOT, capture_output=True, text=True)
        generator_blob = blob_proc.stdout.strip() if blob_proc.returncode == 0 else ""
        if generator_blob != expected_blob:
            failures.append(f"{item.get('id')}: deterministic generator changed from frozen reviewed blob")
            continue
        rebuild_root = os.environ.get("EVIDENCE_LAB_DETERMINISTIC_REBUILD_ROOT", "").strip()
        current_path = (Path(rebuild_root) / output_name) if rebuild_root else (ROOT / "web" / rel)
        if not current_path.is_file():
            failures.append(f"{item.get('id')}: deterministic generated PDF missing after rebuild")
            continue
        current_sha = sha256_file(current_path)
        ok = current_sha == sha
        evidence = f"{generator_rel}@gitblob:{generator_blob};{source_rel}@gitblob:{source_blob}"

    if not ok:
        failures.append(f"{item.get('id')}: provenance verification failed ({status})")
    checked.append({
        "id": item.get("id"),
        "pdf": rel,
        "sha256": sha,
        "provenance_status": status,
        "evidence": evidence,
        "verified": ok,
    })

checked_ids = {row["id"] for row in checked}
missing_checked = sorted(EXPECTED_REMEDIATED_IDS - checked_ids)
unexpected_checked = sorted(checked_ids - EXPECTED_REMEDIATED_IDS)
if missing_checked:
    failures.append(f"expected remediated provenance not replayed: {missing_checked}")
if unexpected_checked:
    failures.append(f"unexpected provenance records replayed: {unexpected_checked}")
if len(checked_ids) != len(EXPECTED_REMEDIATED_IDS):
    failures.append(f"provenance replay count mismatch: expected {len(EXPECTED_REMEDIATED_IDS)}, got {len(checked_ids)}")

if failures:
    print(json.dumps({"checked": len(checked), "failures": failures}, ensure_ascii=False))
    raise SystemExit("canonical PDF provenance verification failed")

print(json.dumps({
    "checked": len(checked),
    "verified": sum(1 for row in checked if row["verified"]),
    "statuses": sorted({row["provenance_status"] for row in checked}),
}, ensure_ascii=False))
