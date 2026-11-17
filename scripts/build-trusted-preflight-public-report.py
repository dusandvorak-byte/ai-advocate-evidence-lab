#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "review-artifacts" / "release-evidence-audit.json"
RESTORE = ROOT / "review-artifacts" / "historical-pdf-restoration.json"
OUT = ROOT / "review-artifacts" / "trusted-preflight-public-report.json"

audit = json.loads(AUDIT.read_text("utf-8"))
restore = json.loads(RESTORE.read_text("utf-8")) if RESTORE.is_file() else {"restored_count": 0, "restored": []}

rows = []
for row in audit.get("all_final_web_pdfs", []):
    rows.append({
        "published_path": row.get("published_path"),
        "source_web_path": row.get("source_web_path"),
        "compatibility_copy": bool(row.get("compatibility_copy")),
        "registered_ids": row.get("registered_ids") or [],
        "registered_statuses": row.get("registered_statuses") or [],
        "derivative": bool(row.get("derivative")),
        "sha256": row.get("sha256"),
        "page_count": row.get("page_count"),
        "metadata_keys_present": row.get("metadata_keys_present") or [],
        "xmp_present": bool(row.get("xmp_present")),
        "embedded_file_count": row.get("embedded_file_count"),
        "file_attachment_annotation_count": row.get("file_attachment_annotation_count"),
        "associated_file_reference_count": row.get("associated_file_reference_count"),
        "embedded_file_object_count": row.get("embedded_file_object_count"),
        "machine_privacy_status": row.get("machine_privacy_status"),
        "checks": row.get("checks") or {},
    })

summary = audit.get("summary") or {}
reconciliation = audit.get("registry_web_stage_reconciliation") or {}
id68 = audit.get("id68_source_public_fidelity") or {}

public_report = {
    "schema_version": "1.0",
    "report_kind": "trusted-preflight-nonsensitive",
    "release_mode": os.environ.get("RELEASE_MODE", "unknown"),
    "build_main_sha": os.environ.get("GITHUB_SHA"),
    "authorized_target_sha": os.environ.get("AUTHORIZED_TARGET_SHA") or None,
    "audit_checkout_commit": audit.get("checkout_commit"),
    "hard_failure_count": summary.get("hard_failure_count"),
    "staged_set_exact_match": summary.get("staged_set_exact_match"),
    "id69_absent_from_final_release_state": summary.get("id69_absent_from_final_release_state"),
    "generated_derivative_count": summary.get("generated_derivative_count"),
    "all_final_staged_pdf_count": summary.get("all_final_staged_pdf_count"),
    "canonical_registry_reference_count": summary.get("canonical_registry_reference_count"),
    "historical_restored_count": restore.get("restored_count", 0),
    "historical_restored": [
        {"path": item.get("path"), "sha256": item.get("sha256")}
        for item in restore.get("restored", [])
    ],
    "id68": {
        "source_original_sha256": id68.get("source_original_sha256"),
        "source_original_page_count": id68.get("source_original_page_count"),
        "public_derivative_sha256": id68.get("public_derivative_sha256"),
        "public_derivative_page_count": id68.get("public_derivative_page_count"),
        "fidelity_class": id68.get("fidelity_class"),
        "render_faithful_facsimile_claimed": id68.get("render_faithful_facsimile_claimed"),
        "checks": id68.get("checks") or {},
    },
    "reconciliation": {
        "source_web_pdf_count": reconciliation.get("source_web_pdf_count"),
        "canonical_unique_pdf_count": reconciliation.get("canonical_unique_pdf_count"),
        "expected_root_pdf_count": reconciliation.get("expected_root_pdf_count"),
        "staged_pdf_count": reconciliation.get("staged_pdf_count"),
        "expected_staged_pdf_count": reconciliation.get("expected_staged_pdf_count"),
        "staged_set_exact_match": reconciliation.get("staged_set_exact_match"),
        "id69_absent_from_final_release_state": reconciliation.get("id69_absent_from_final_release_state"),
    },
    "outputs": rows,
}

if public_report["hard_failure_count"] != 0:
    raise SystemExit("trusted preflight cannot emit PASS report with hard failures")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(public_report, ensure_ascii=False, indent=2) + "\n", "utf-8")
print(json.dumps({
    "report": str(OUT.relative_to(ROOT)),
    "outputs": len(rows),
    "restored": public_report["historical_restored_count"],
    "hard_failure_count": public_report["hard_failure_count"],
}, ensure_ascii=False))
