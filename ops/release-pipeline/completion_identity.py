"""Isolated identity selector for a future read-only completion consumer.

Input must come from the authenticated GitHub API, not an artifact or PR.
This function cannot authorize publication or establish artifact integrity.
"""
import re

REPO = "dusandvorak-byte/ai-advocate-evidence-lab"
WORKFLOW = ".github/workflows/trusted-pdf-shard-diagnostic.yml"
SHA = re.compile(r"[0-9a-f]{40}")


def select_completed_run(event_run, api_run, latest_run, current_main):
    """Return exact run id only if event, API and current latest run agree."""
    if not isinstance(current_main, str) or not SHA.fullmatch(current_main):
        raise ValueError("invalid current main")
    for run in (event_run, api_run, latest_run):
        if not isinstance(run, dict):
            raise ValueError("missing run")
        if (type(run.get("id")) is not int or run["id"] <= 0 or
            type(run.get("run_attempt")) is not int or run["run_attempt"] <= 0 or
            run.get("head_sha") != current_main or run.get("head_branch") != "main" or
            run.get("event") != "push" or run.get("path") != WORKFLOW or
            run.get("status") != "completed" or run.get("conclusion") != "success" or
            (run.get("repository") or {}).get("full_name") != REPO or
            (run.get("head_repository") or {}).get("full_name") != REPO):
            raise ValueError("untrusted or stale completion")
    identities = {(run["id"], run["run_attempt"]) for run in (event_run, api_run, latest_run)}
    if len(identities) != 1:
        raise ValueError("run superseded or identity mismatch")
    return api_run["id"]
