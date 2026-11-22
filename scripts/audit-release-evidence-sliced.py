#!/usr/bin/env python3
import importlib.util
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = ROOT / "scripts" / "audit-release-evidence-2026-11-13.py"
FRAG_DIR = ROOT / "review-artifacts" / "release-audit-fragments"
OUT = ROOT / "review-artifacts" / "release-evidence-audit.json"

spec = importlib.util.spec_from_file_location("evidence_release_audit", AUDIT_PATH)
audit = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(audit)


def current_checkout_sha():
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def write_fragment(name, data, failures):
    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    path = FRAG_DIR / f"{name}.json"
    payload = {
        "checkout_commit": current_checkout_sha(),
        "data": data,
        "failures": list(failures),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"fragment": name, "failure_count": len(failures)}, ensure_ascii=False))


def load_fragment(name):
    payload = json.loads((FRAG_DIR / f"{name}.json").read_text("utf-8"))
    expected = current_checkout_sha()
    actual = str(payload.get("checkout_commit") or "")
    if actual != expected:
        raise RuntimeError(
            f"stale audit fragment {name}: checkout {actual or 'missing'} != {expected}"
        )
    return payload


def cmd_generated():
    data, failures = audit.audit_generated()
    write_fragment("generated", data, failures)


def cmd_registry():
    data, failures = audit.audit_registry_public_derivatives()
    write_fragment("registry-derivatives", data, failures)


def cmd_pdf_shard(index, count):
    registry_path = audit.WEB / "data/documents-2026.json"
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
        if __import__("re").search(r"(?i)(verejna|veřejná|textova|textová|redigovan|public[-_ ]?copy)", rel) or any(marker in status for marker in markers):
            derivative_paths.add(rel)

    canonical = json.loads(audit.CANONICAL_REGISTRY.read_text("utf-8"))
    for item in canonical.get("documents", []):
        public = item.get("public") or {}
        rel = str(public.get("pdf") or "")
        if not rel:
            continue
        refs = registry_by_path.setdefault(rel, [])
        item_id = item.get("id")
        if item_id and not any(ref.get("id") == item_id for ref in refs):
            refs.append({"id": item_id, "verification_status": public.get("verification_status")})
        status = " ".join([
            str(public.get("verification_status") or ""),
            str(public.get("public_copy_note") or ""),
            rel,
        ]).lower()
        if __import__("re").search(r"(?i)(verejna|veřejná|textova|textová|redigovan|public[-_ ]?copy)", rel) or any(marker in status for marker in markers):
            derivative_paths.add(rel)

    pdfs = audit.publication_pdf_paths(audit.PUBLICATION_ROOT)
    rows = []
    failures = []
    if not pdfs:
        failures.append(f"no PDF-signature/suffix candidates found under publication root {audit.PUBLICATION_ROOT}")

    # Group byte-identical compatibility copies before sharding. The expensive
    # qpdf / PyMuPDF / pdftotext pass is content-derived, so one representative
    # can safely provide facts for every path with the same SHA-256.
    groups = {}
    for path in pdfs:
        digest = audit.sha256_file(path)
        groups.setdefault(digest, []).append(path)

    # Deterministic longest-processing-time approximation: large unique payloads
    # are assigned first to the currently lightest shard. This avoids the long
    # tail caused by naive path-stride sharding while keeping output reproducible.
    shard_groups = [[] for _ in range(count)]
    shard_weights = [0 for _ in range(count)]
    weighted_groups = []
    for digest, paths in groups.items():
        paths.sort(key=lambda p: p.as_posix().lower())
        weighted_groups.append((paths[0].stat().st_size, digest, paths))
    weighted_groups.sort(key=lambda item: (-item[0], item[1]))

    for size_bytes, digest, paths in weighted_groups:
        target = min(range(count), key=lambda shard: (shard_weights[shard], shard))
        shard_groups[target].append((digest, paths))
        shard_weights[target] += size_bytes

    def inspect_group(group):
        file_sha, identical_paths = group
        representative = identical_paths[0]
        facts = audit.pdf_facts(representative)
        local_rows = []
        local_failures = []
        for path in identical_paths:
            published_rel = path.relative_to(audit.PUBLICATION_ROOT).as_posix()
            compatibility_copy = audit.PUBLICATION_ROOT != audit.WEB and published_rel.startswith("web/")
            source_rel = published_rel[4:] if compatibility_copy else published_rel
            refs = registry_by_path.get(source_rel, [])
            is_derivative = source_rel in derivative_paths
            checks = {
                "excluded_id69_digest_absent": file_sha != audit.EXCLUDED_ID69_SHA256,
                "pdf_header_prefix_clean": not facts["non_whitespace_prefix_before_pdf_header"],
                "pdf_eof_present": facts["pdf_eof_present"],
                "pdf_revision_markers_bound": facts["pdf_revision_markers_bound"],
                "pdf_single_revision_only": facts["pdf_single_revision_only"],
                "qpdf_structurally_valid": facts["qpdf_structurally_valid"],
                "pdf_trailing_payload_absent": not facts["non_whitespace_suffix_after_pdf_eof"],
                "machine_privacy_not_failed": facts["machine_privacy_status"] != "FAIL_PRIVATE_OR_METADATA_CHANNEL",
                "inline_images_absent": facts.get("inline_image_stream_count", 0) == 0,
                "forbidden_identifiers_absent": not facts["known_private_identifier_hits"],
                "embedded_files_absent": facts["embedded_file_count"] == 0,
                "file_attachment_annotations_absent": facts["file_attachment_annotation_count"] == 0,
                "associated_files_absent": facts["associated_file_reference_count"] == 0,
                "embedded_file_objects_absent": facts["embedded_file_object_count"] == 0,
                "suspicious_info_metadata_absent": not facts["suspicious_metadata_keys"],
                "xmp_private_or_suspicious_absent": not facts["xmp_known_private_identifier_hits"] and not facts["xmp_suspicious"],
            }
            if is_derivative:
                checks["derivative_xmp_removed"] = not facts["xmp_present"]
            if not all(checks.values()):
                local_failures.append(f"final staged PDF privacy failure {published_rel}: {checks}")
            local_rows.append({
                "published_path": published_rel,
                "source_web_path": source_rel,
                "compatibility_copy": compatibility_copy,
                "registered": bool(refs),
                "registry_ids": [ref.get("id") for ref in refs if ref.get("id")],
                "verification_statuses": [ref.get("verification_status") for ref in refs if ref.get("verification_status")],
                "derivative": is_derivative,
                "sha256": file_sha,
                "page_count": facts["page_count"],
                "metadata_keys_present": facts["metadata_keys_present"],
                "xmp_present": facts["xmp_present"],
                "embedded_file_count": facts["embedded_file_count"],
                "file_attachment_annotation_count": facts["file_attachment_annotation_count"],
                "associated_file_reference_count": facts["associated_file_reference_count"],
                "embedded_file_object_count": facts["embedded_file_object_count"],
                "machine_privacy_status": facts["machine_privacy_status"],
                "suspicious_metadata_keys": facts["suspicious_metadata_keys"],
                "xmp_known_private_identifier_hits": facts["xmp_known_private_identifier_hits"],
                "xmp_suspicious": facts["xmp_suspicious"],
                "known_private_identifier_hits": facts["known_private_identifier_hits"],
                "content_privacy_signals": facts["content_privacy_signals"],
                "checks": checks,
            })
        return local_rows, local_failures

    selected_groups = shard_groups[index]
    workers = max(1, min(int(os.environ.get("EVIDENCE_LAB_PDF_SHARD_WORKERS", "2")), len(selected_groups) or 1))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(inspect_group, group) for group in selected_groups]
        for future in as_completed(futures):
            local_rows, local_failures = future.result()
            rows.extend(local_rows)
            failures.extend(local_failures)
    rows.sort(key=lambda row: row["published_path"])
    failures.sort()
    print(json.dumps({
        "pdf_path_count": len(pdfs),
        "unique_pdf_digest_count": len(groups),
        "deduplicated_path_count": len(pdfs) - len(groups),
        "shard": index,
        "shard_unique_digest_count": len(shard_groups[index]),
        "shard_weight_bytes": shard_weights[index],
        "parallel_workers": workers,
    }, ensure_ascii=False))
    write_fragment(f"pdf-shard-{index}-of-{count}", rows, failures)


def cmd_okte():
    data, failures = audit.audit_okte()
    write_fragment("okte", data, failures)


def cmd_redacted():
    data, failures = audit.audit_redacted_analysis()
    write_fragment("redacted", data, failures)


def cmd_assemble(count):
    generated_fragment = load_fragment("generated")
    registry_fragment = load_fragment("registry-derivatives")
    generated = generated_fragment["data"]
    registry_derivatives = registry_fragment["data"]

    fragment_failures = list(generated_fragment.get("failures") or [])
    fragment_failures += list(registry_fragment.get("failures") or [])

    all_web_pdfs = []
    for index in range(count):
        shard_fragment = load_fragment(f"pdf-shard-{index}-of-{count}")
        all_web_pdfs.extend(shard_fragment["data"])
        fragment_failures += list(shard_fragment.get("failures") or [])
    all_web_pdfs.sort(key=lambda row: row["published_path"])

    reconciliation, reconciliation_fail = audit.audit_registry_reconciliation(all_web_pdfs)
    id68_fidelity, id68_fail = audit.audit_id68_fidelity(all_web_pdfs, generated)

    precomputed_facts = {}
    for row in all_web_pdfs:
        rel = row["source_web_path"]
        precomputed_facts.setdefault(rel, {
            "page_count": row["page_count"],
            "metadata_keys_present": row["metadata_keys_present"],
            "xmp_present": row["xmp_present"],
            "embedded_file_count": row["embedded_file_count"],
            "file_attachment_annotation_count": row["file_attachment_annotation_count"],
            "associated_file_reference_count": row["associated_file_reference_count"],
            "embedded_file_object_count": row["embedded_file_object_count"],
            "machine_privacy_status": row["machine_privacy_status"],
            "suspicious_metadata_keys": row["suspicious_metadata_keys"],
            "xmp_known_private_identifier_hits": row["xmp_known_private_identifier_hits"],
            "xmp_suspicious": row["xmp_suspicious"],
            "known_private_identifier_hits": row["known_private_identifier_hits"],
            "content_privacy_signals": row["content_privacy_signals"],
        })

    okte, okte_fail = audit.audit_okte(precomputed_facts)
    redacted, redact_fail = audit.audit_redacted_analysis(precomputed_facts)

    hardening_path = ROOT / "project-memory/privacy-hardening-report.json"
    hardening = json.loads(hardening_path.read_text("utf-8"))
    hardening_fail = list(hardening.get("hard_failures") or [])
    if hardening.get("hard_failure_count") != len(hardening_fail):
        hardening_fail.append("privacy hardening failure count does not match hard failure list")

    failures = fragment_failures + reconciliation_fail + id68_fail + hardening_fail + okte_fail + redact_fail
    checkout_sha = current_checkout_sha()
    expected_head = os.environ.get("EXPECTED_HEAD_SHA", "").strip()
    expected_base = os.environ.get("EXPECTED_BASE_SHA", "").strip()
    expected_base_source = "workflow_event" if expected_base else "remote_main_derived"
    if expected_head and checkout_sha != expected_head:
        failures.append(f"checkout SHA {checkout_sha} != expected PR head {expected_head}")

    remote = subprocess.run(["git", "ls-remote", "origin", "refs/heads/main"], check=False, capture_output=True, text=True)
    remote_main_sha = remote.stdout.split()[0] if remote.returncode == 0 and remote.stdout.strip() else None
    if not remote_main_sha:
        failures.append("cannot verify current remote main SHA")
    if not expected_base:
        # GitHub push/PR evidence is immutable: never substitute mutable
        # remote main when the workflow omitted its event-bound base SHA.
        if os.environ.get("GITHUB_ACTIONS") == "true":
            failures.append("EXPECTED_BASE_SHA missing from immutable GitHub event")
        else:
            expected_base = remote_main_sha or ""
    merge_base = None
    base_is_ancestor = None
    if expected_base:
        ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", expected_base, checkout_sha], capture_output=True, text=True)
        base_is_ancestor = ancestor.returncode == 0
        if not base_is_ancestor:
            failures.append(f"expected base {expected_base} is not an ancestor of checkout {checkout_sha}")
        merge = subprocess.run(["git", "merge-base", expected_base, checkout_sha], check=False, capture_output=True, text=True)
        merge_base = merge.stdout.strip() or None
        if merge.returncode != 0 or merge_base != expected_base:
            failures.append(f"merge-base mismatch: expected {expected_base}, got {merge_base or 'none'}")
        if remote_main_sha:
            # main may legitimately advance after this run starts. Confirm
            # checkout remains in its ancestry; never use its mutable tip as
            # this run's expected base.
            remote_ancestor = subprocess.run(
                ["git", "merge-base", "--is-ancestor", checkout_sha, remote_main_sha],
                capture_output=True, text=True,
            )
            if remote_ancestor.returncode != 0:
                failures.append(
                    f"remote main diverged from audited checkout {checkout_sha}: {remote_main_sha}"
                )

    report = {
        "schema_version": "1.1-sliced",
        "scope": "nonpublishing integration evidence; sliced execution",
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
        "id68_source_public_fidelity": id68_fidelity,
        "privacy_hardening": hardening,
        "okte_originals": okte,
        "redacted_okte_analysis": redacted,
        "execution": {
            "pdf_shard_count": count,
            "staged_pdf_path_count": len(all_web_pdfs),
            "unique_pdf_digest_count": len({row["sha256"] for row in all_web_pdfs}),
            "deduplicated_pdf_path_count": len(all_web_pdfs) - len({row["sha256"] for row in all_web_pdfs}),
        },
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
    if failures:
        raise SystemExit("\n".join(failures))


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: sliced.py generated|registry|pdf-shard I N|okte|redacted|assemble N")
    cmd = sys.argv[1]
    if cmd == "generated":
        cmd_generated()
    elif cmd == "registry":
        cmd_registry()
    elif cmd == "pdf-shard":
        cmd_pdf_shard(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == "okte":
        cmd_okte()
    elif cmd == "redacted":
        cmd_redacted()
    elif cmd == "assemble":
        cmd_assemble(int(sys.argv[2]))
    else:
        raise SystemExit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main()
