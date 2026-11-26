"""Read-only diagnostic: exact trusted shadow parity, never reuse authority."""
import argparse
import json
import re
import subprocess

REPO = "dusandvorak-byte/ai-advocate-evidence-lab"
WORKFLOW = ".github/workflows/trusted-pdf-shard-diagnostic.yml"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_run(run, sha, run_id):
    require(re.fullmatch(r"[0-9a-f]{40}", sha) is not None, "invalid source SHA")
    require(type(run_id) is int and run_id > 0, "invalid run ID")
    require(run.get("id") == run_id and run.get("head_sha") == sha
            and run.get("head_branch") == "main" and run.get("event") == "push"
            and run.get("path") == WORKFLOW and run.get("status") == "completed"
            and run.get("conclusion") == "success" and run.get("run_attempt") == 1
            and (run.get("repository") or {}).get("full_name") == REPO
            and (run.get("head_repository") or {}).get("full_name") == REPO,
            "not an exact successful trusted main audit")


def shadow_event(log):
    matches = []
    for line in log.splitlines():
        # GitHub job logs are timestamp-prefixed. Ignore shell echo and
        # unstructured lines, and never print raw logs.
        _, _, payload = line.partition(" ")
        candidate = payload.strip()
        if not candidate.startswith("{"):
            continue
        try:
            row = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict) and row.get("event") == "pdf-transform-shadow":
            matches.append(row)
    require(len(matches) == 1, "missing or ambiguous shadow result")
    return matches[0]


def evaluate(row):
    require(row.get("event") == "pdf-transform-shadow", "wrong event")
    if row.get("prior_available") is False:
        return {"eligible": False, "reason": "cold-cache"}
    keys = ("captured", "potential_hits", "exact_matches", "mismatches",
            "prior_entry_count", "path_identity_matches", "skipped")
    require(all(type(row.get(k)) is int and row[k] >= 0 for k in keys),
            "invalid shadow counters")
    require(row.get("fresh_scan_authoritative") is True and row["skipped"] == 0,
            "not an authoritative fresh shadow comparison")
    identities = row.get("identity_mismatches")
    require(isinstance(identities, list) and all(x in
            ("policy_sha256", "private_policy_identity", "engine_sha256") for x in identities),
            "invalid identity mismatch report")
    require(row["potential_hits"] <= min(row["captured"], row["prior_entry_count"],
            row["path_identity_matches"]) and
            row["exact_matches"] + row["mismatches"] == row["potential_hits"],
            "inconsistent shadow counts")
    eligible = (not identities and row["potential_hits"] > 0 and
                row["mismatches"] == 0 and row["exact_matches"] == row["potential_hits"])
    return {"eligible": eligible, "potential_hits": row["potential_hits"],
            "exact_matches": row["exact_matches"], "mismatches": row["mismatches"],
            "identity_mismatches": identities}


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{path}"], timeout=60))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--run-id", type=int, required=True)
    args = parser.parse_args()
    run = api(f"actions/runs/{args.run_id}")
    verify_run(run, args.sha, args.run_id)
    jobs = api(f"actions/runs/{args.run_id}/attempts/1/jobs?per_page=100")
    require(jobs["total_count"] == len(jobs["jobs"]) <= 100, "ambiguous job list")
    prepare = [j for j in jobs["jobs"] if j.get("name") == "prepare"]
    require(len(prepare) == 1, "missing or ambiguous prepare job")
    job = prepare[0]
    require(job.get("run_id") == args.run_id and job.get("head_sha") == args.sha
            and job.get("status") == "completed" and job.get("conclusion") == "success",
            "prepare job identity mismatch")
    log = subprocess.check_output(["gh", "api", f"repos/{REPO}/actions/jobs/{job['id']}/logs"],
                                  text=True, timeout=120)
    result = evaluate(shadow_event(log))
    verify_run(api(f"actions/runs/{args.run_id}"), args.sha, args.run_id)
    print(json.dumps({"scope": "shadow-cache-eligibility-diagnostic",
                      "source_sha": args.sha, "audit_run_id": args.run_id,
                      **result, "reuse_authorized": False,
                      "fresh_final_audit_required": True}, sort_keys=True))


if __name__ == "__main__":
    main()
