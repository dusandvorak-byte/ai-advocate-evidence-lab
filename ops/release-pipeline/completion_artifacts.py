"""Read-only selection of exact successful audit artifacts; no publication."""
import re
from completion_identity import SHA


def select_artifacts(artifacts, run_id, source_sha):
    if type(run_id) is not int or run_id < 1 or not SHA.fullmatch(source_sha):
        raise ValueError("invalid run identity")
    names = {"tree": f"trusted-public-tree-{source_sha}",
             "report": f"evidence-lab-pdf-shard-diagnostic-{source_sha}"}
    result = {}
    for kind, name in names.items():
        matches = [a for a in artifacts if a.get("name") == name]
        if len(matches) != 1:
            raise ValueError("missing or ambiguous exact artifact")
        artifact = matches[0]
        workflow = artifact.get("workflow_run") or {}
        # List endpoint may not include workflow_run; fetch individual artifact
        # details through the authenticated API before invoking this selector.
        if (type(artifact.get("id")) is not int or artifact["id"] < 1
                or artifact.get("expired") is not False
                or workflow.get("id") != run_id or workflow.get("head_sha") != source_sha
                or not re.fullmatch(r"sha256:[0-9a-f]{64}", artifact.get("digest") or "")
                or type(artifact.get("size_in_bytes")) is not int
                or artifact["size_in_bytes"] < 1):
            raise ValueError("invalid exact artifact identity")
        result[kind] = {"id": artifact["id"], "sha256": artifact["digest"][7:],
                        "size": artifact["size_in_bytes"]}
    if result["tree"]["id"] == result["report"]["id"]:
        raise ValueError("artifact identities overlap")
    return result


def validate_report(report, source_sha):
    if report.get("checkout_commit") != source_sha or report.get("schema_version") != "1.1-sliced":
        raise ValueError("audit source/schema mismatch")
    summary = report.get("summary") or {}
    reconciliation = report.get("registry_web_stage_reconciliation") or {}
    if (type(summary.get("hard_failure_count")) is not int or summary["hard_failure_count"] != 0
            or summary.get("hard_failures") != []
            or summary.get("human_content_privacy_review_still_required") is not True
            or reconciliation.get("staged_set_exact_match") is not True
            or reconciliation.get("id69_absent_from_final_release_state") is not True):
        raise ValueError("audit report is not clean")
