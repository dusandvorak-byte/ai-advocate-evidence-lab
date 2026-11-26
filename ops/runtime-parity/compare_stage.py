"""Read-only comparison of fresh candidate audit fragments with authenticated baseline.

The caller must authenticate prior successful run, tree and report ZIP digests
before supplying files. This is not a loader, publisher, or approval gate.
Do not run with a production policy in a PR context.
"""
import re
import json
from collections import Counter

SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"[0-9a-f]{64}")
SECTIONS = {
    "generated": "generated_public_derivatives",
    "registry-derivatives": "registry_public_derivatives",
    "pdf-shard": "all_final_web_pdfs",
}


def semantic_rows(rows, section):
    if not isinstance(rows, list) or not rows:
        raise ValueError("empty or invalid audit rows")
    key = {"generated": "output", "registry-derivatives": "public_path",
           "pdf-shard": "published_path"}[section]
    indexed = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("invalid row")
        path = row.get(key)
        digest = row.get("output_sha256" if section == "generated" else "sha256")
        if not isinstance(path, str) or not path or path in indexed:
            raise ValueError("invalid or duplicate audit path")
        if not isinstance(digest, str) or not DIGEST.fullmatch(digest):
            raise ValueError("invalid row digest")
        # Existing ledger treats only qpdf stderr tail as nonsemantic.
        indexed[path] = {k:v for k,v in row.items() if k != "qpdf_check_tail"}
    return indexed


def validate_baseline(baseline, source_sha):
    if not isinstance(source_sha, str) or not SHA.fullmatch(source_sha):
        raise ValueError("invalid exact source SHA")
    if baseline.get("schema_version") != "1.1-sliced" or baseline.get("checkout_commit") != source_sha:
        raise ValueError("wrong baseline schema or source")
    summary = baseline.get("summary", {})
    if (type(summary.get("hard_failure_count")) is not int or summary["hard_failure_count"] != 0
            or summary.get("hard_failures") != []
            or summary.get("staged_set_exact_match") is not True
            or summary.get("id69_absent_from_final_release_state") is not True
            or summary.get("human_content_privacy_review_still_required") is not True):
        raise ValueError("baseline audit not clean")

def compare_section(baseline, fresh, section, source_sha):
    if fresh.get("checkout_commit") != source_sha or fresh.get("failures") != []:
        raise ValueError("fresh audit source mismatch or failure: " + section)
    expected = semantic_rows(baseline[SECTIONS[section]], section)
    actual = semantic_rows(fresh["data"], section)
    if expected != actual:
        # Only field names and counts; never report field values, extracted
        # text, private identifiers or policy data. Do not normalize differences.
        missing = set(expected) - set(actual)
        extra = set(actual) - set(expected)
        changed = 0
        fields = Counter()
        for path in set(expected) & set(actual):
            left, right = expected[path], actual[path]
            if left != right:
                changed += 1
                for key in set(left) | set(right):
                    if key not in left or key not in right or left[key] != right[key]:
                        fields[key] += 1
        detail = {"section": section, "missing_rows": len(missing),
                  "extra_rows": len(extra), "changed_rows": changed,
                  "changed_fields": dict(sorted(fields.items()))}
        raise ValueError("semantic audit mismatch: " + json.dumps(detail, sort_keys=True))
    return len(actual)


def compare(baseline, fragments, source_sha):
    validate_baseline(baseline, source_sha)
    if set(fragments) != set(SECTIONS):
        raise ValueError("missing or extra audit section")
    counts = {}
    for section in SECTIONS:
        counts[section] = compare_section(baseline, fragments[section], section, source_sha)
    summary = baseline["summary"]
    if (summary.get("all_final_staged_pdf_count") != counts["pdf-shard"]
            or summary.get("generated_derivative_count") != counts["generated"]
            or summary.get("registry_public_derivative_count") != counts["registry-derivatives"]):
        raise ValueError("baseline summary count mismatch")
    return {"exact_semantic_match": True, "counts": counts,
            "human_review_required": True, "production_authorization": False}
