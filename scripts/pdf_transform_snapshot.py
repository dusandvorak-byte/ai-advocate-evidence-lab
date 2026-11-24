"""Shadow capture and validation of exact-source/public transformations.

No raw input bytes, private policy literals or page text are exported.
This module plans reuse only; it neither authorizes nor mutates public files.
A future consumer must authenticate a completed trusted run and sign this
validated evidence using the dedicated ledger key.
"""
from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path

from pdf_audit_ledger import canonical, valid_digest, valid_origin, safe_path, file_sha
from pdf_transform_ledger import context_digest, EXCLUDED, EXCLUDED_ID69_SHA256

CHECKS = frozenset("""
excluded_id69_digest_absent pdf_header_prefix_clean pdf_eof_present
pdf_revision_markers_bound pdf_single_revision_only qpdf_structurally_valid
pdf_trailing_payload_absent machine_privacy_not_failed inline_images_absent
forbidden_identifiers_absent embedded_files_absent file_attachment_annotations_absent
associated_files_absent embedded_file_objects_absent suspicious_info_metadata_absent
xmp_private_or_suspicious_absent
""".split())
STRATEGIES = {"redact", "qpdf_rewrite", "pymupdf_metadata", "pymupdf_rewrite"}
RULE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def capture_inputs(*, web, by_path, policy_sha, identity, engine_sha, path_policy_sha, origin):
    """Capture immediately before hardening, in the same trusted prepare job."""
    require(valid_origin(origin) and all(valid_digest(v) for v in
            (policy_sha, identity, engine_sha, path_policy_sha)), "invalid capture identity")
    rows = {}
    for rel, docs in sorted(by_path.items()):
        if not safe_path(rel) or rel.startswith(EXCLUDED) or not rel.lower().endswith(".pdf"):
            continue
        if not docs or any(d.get("release_excluded") is True for d in docs):
            continue
        path = Path(web) / rel
        if not path.is_file() or path.is_symlink():
            continue
        digest = file_sha(path)
        if digest == EXCLUDED_ID69_SHA256:
            continue
        ids = sorted(d["id"] for d in docs)
        require(len(ids) == len(set(ids)), "duplicate capture identity")
        rows[rel] = {"source_sha256": digest, "context_sha256": context_digest(docs, path_policy_sha),
                     "ids": ids}
    return {"schema": 1, "scope": "shadow-transform-inputs", "origin": origin,
            "policy_sha256": policy_sha, "private_policy_identity": identity,
            "engine_sha256": engine_sha, "path_policy_sha256": path_policy_sha,
            "inputs": rows}


def audit_index(report, source, policy_sha, identity):
    require(report.get("schema_version") == "1.1-sliced" and
            report.get("checkout_commit") == source and report.get("github_event_sha") == source and
            report.get("expected_pr_head_commit") == source and report.get("base_is_ancestor") is True,
            "audit source mismatch")
    summary = report["summary"]
    require(summary["hard_failure_count"] == 0 and summary["hard_failures"] == [] and
            summary["human_content_privacy_review_still_required"] is True, "audit not clean")
    rec = report["registry_web_stage_reconciliation"]
    require(rec["staged_set_exact_match"] is True and rec["id69_absent_from_final_release_state"] is True,
            "registry reconciliation not clean")
    hard = report["privacy_hardening"]
    require(hard["schema_version"] == "1.2" and hard["policy_sha256"] == policy_sha and
            hard["authenticated_private_policy_identity"] == identity and
            hard["hard_failure_count"] == 0 and hard["hard_failures"] == [], "hardening policy mismatch")
    final = {}
    for row in report["all_final_web_pdfs"]:
        p = row["published_path"]
        require(safe_path(p) and p not in final, "duplicate or unsafe final path")
        checks = row["checks"]
        expected = CHECKS | ({"derivative_xmp_removed"} if row["derivative"] is True else set())
        require(set(checks) == expected and all(v is True for v in checks.values()) and
                valid_digest(row["sha256"]) and row["sha256"] != EXCLUDED_ID69_SHA256 and
                type(row["page_count"]) is int and row["page_count"] > 0,
                "incomplete or failed final checks")
        final[p] = row
    require(len(final) == summary["all_final_staged_pdf_count"], "audit count mismatch")
    by_path = {}
    for row in hard["documents"]:
        by_path.setdefault(row["public_path"], []).append(row)
    return final, by_path


def build_reuse_plan(*, snapshot, report, stage, expected_origin):
    """Requires externally authenticated same-run snapshot and report archives.

    Returned entries are advisory until the issuer authenticates run/artifacts
    and signs them. Do not derive a missing input/context hash from final output.
    """
    require(valid_origin(expected_origin) and snapshot["origin"] == expected_origin and
            snapshot["schema"] == 1 and snapshot["scope"] == "shadow-transform-inputs",
            "snapshot provenance mismatch")
    policy, identity, engine, context = (snapshot[k] for k in
        ("policy_sha256", "private_policy_identity", "engine_sha256", "path_policy_sha256"))
    require(all(valid_digest(v) for v in (policy, identity, engine, context)), "invalid snapshot identity")
    final, hard = audit_index(report, expected_origin["source_commit"], policy, identity)
    stage = Path(stage)
    entries = []
    rejected = {}
    def skip(reason):
        rejected[reason] = rejected.get(reason, 0) + 1
    for rel, original in sorted(snapshot["inputs"].items()):
        if not safe_path(rel) or rel.startswith(EXCLUDED) or not valid_digest(original["source_sha256"]) or not valid_digest(original["context_sha256"]):
            skip("unsupported_or_excluded")
            continue
        source = original["source_sha256"]
        rows = hard.get(rel, [])
        ids = original["ids"]
        if not rows or sorted(r["id"] for r in rows if r.get("registered") is True and isinstance(r.get("id"), str)) != ids or len(rows) != len(ids):
            skip("missing_registered_transform")
            continue
        row = rows[0]
        keys = ("input_sha256", "output_sha256", "page_count", "strategy", "changed",
                "redaction_matches", "text_fallback", "known_private_identifier_hits_after",
                "decoded_private_identifier_hits_after")
        if any(any(r.get(k) != row.get(k) for k in keys) for r in rows):
            skip("ambiguous_transform")
            continue
        output = row.get("output_sha256")
        strategy = row.get("strategy")
        matches = row.get("redaction_matches")
        pages = row.get("page_count")
        if (row.get("changed") is not True or row.get("input_sha256") != source or not valid_digest(output) or
            source == output or EXCLUDED_ID69_SHA256 in (source, output) or strategy not in STRATEGIES or
            row.get("text_fallback") is not None or row.get("known_private_identifier_hits_after") != [] or
            row.get("decoded_private_identifier_hits_after") != [] or type(pages) is not int or pages < 1 or
            not isinstance(matches, list)):
            skip("unsupported_transform")
            continue
        if strategy == "redact":
            if not matches or any(not isinstance(m, dict) or set(m) != {"page", "rule"} or
                type(m["page"]) is not int or not 1 <= m["page"] <= pages or
                not isinstance(m["rule"], str) or RULE.fullmatch(m["rule"]) is None for m in matches):
                skip("invalid_redaction_evidence")
                continue
        elif matches:
            skip("unexpected_redaction")
            continue
        a, b = final.get(rel), final.get("web/" + rel)
        if not a or not b or any(x["sha256"] != output or x["page_count"] != pages or
            x["xmp_present"] is not False or sorted(x["registry_ids"]) != ids for x in (a,b)):
            skip("final_audit_mismatch")
            continue
        require(file_sha(stage / rel) == output and file_sha(stage / "web" / rel) == output,
                "stage bytes changed or mirror mismatch")
        entries.append({"rel": rel, "source_sha256": source, "public_sha256": output,
                        "context_sha256": original["context_sha256"], "ids": ids, "page_count": pages,
                        "strategy": strategy, "redaction_matches": matches,
                        "audit_checks": a["checks"], "human_review_required": True})
    return {"schema": 1, "scope": "advisory-transform-reuse-plan", "origin": expected_origin,
            "policy_sha256": policy, "private_policy_identity": identity, "engine_sha256": engine,
            "entries": entries, "rejected": rejected, "authorization_granted": False,
            "skip_scan_granted": False, "report_sha256": hashlib.sha256(canonical(report)).hexdigest()}
