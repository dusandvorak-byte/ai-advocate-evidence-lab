"""Immutable GitHub event ancestry guard for sliced release audit."""
import re
import subprocess

SHA = re.compile(r"^[0-9a-f]{40}$")


def check_lineage(*, checkout, expected_head, expected_base, remote_main, github_actions, run):
    """Return validated base, source, ancestry details and blocking failures.

    run(args) returns a subprocess.CompletedProcess-like object.
    The remote tip is only checked for descendant/divergence, never used as
    an event base inside GitHub Actions.
    """
    failures = []
    source = "workflow_event" if expected_base else "remote_main_derived"
    if expected_head and (not SHA.fullmatch(expected_head) or checkout != expected_head):
        failures.append(f"checkout SHA {checkout} != expected event HEAD {expected_head}")
    if not SHA.fullmatch(checkout):
        failures.append("checkout SHA invalid")
    if not expected_base:
        if github_actions:
            failures.append("EXPECTED_BASE_SHA missing from immutable GitHub event")
        else:
            expected_base = remote_main or ""
    if expected_base and not SHA.fullmatch(expected_base):
        failures.append("EXPECTED_BASE_SHA invalid")
    if not remote_main or not SHA.fullmatch(remote_main):
        failures.append("cannot verify current remote main SHA")

    merge_base = None
    base_is_ancestor = None
    if SHA.fullmatch(expected_base or "") and SHA.fullmatch(checkout):
        is_ancestor = run(["git", "merge-base", "--is-ancestor", expected_base, checkout])
        base_is_ancestor = is_ancestor.returncode == 0
        if not base_is_ancestor:
            failures.append(f"expected base {expected_base} is not an ancestor of checkout {checkout}")
        merge = run(["git", "merge-base", expected_base, checkout])
        merge_base = merge.stdout.strip() if merge.returncode == 0 else None
        if merge_base != expected_base:
            failures.append(f"merge-base mismatch: expected {expected_base}, got {merge_base or 'none'}")
    if SHA.fullmatch(remote_main or "") and SHA.fullmatch(checkout):
        # Caller fetches remote tip if missing. A newer descendant is fine:
        # an immutable event-bound audit must not fail solely due to later pushes.
        descendant = run(["git", "merge-base", "--is-ancestor", checkout, remote_main])
        if descendant.returncode != 0:
            failures.append(f"remote main diverged from audited checkout {checkout}: {remote_main}")
    return expected_base, source, base_is_ancestor, merge_base, failures
