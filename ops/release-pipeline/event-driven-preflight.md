# P3: Event-driven release preflight (design, not active)

Current state: two consumers poll the same trusted shard workflow every 10 seconds, with a 5100-second deadline. They also download and validate the same tree. Waiting occupies runners; it does not by itself add 85 minutes to the critical path. Keep all existing checks until an independently reviewed replacement is measured.

## Proposed separation

1. Ordinary main push: trusted shard workflow remains unchanged and is authoritative.
2. Completion event: a read-only preflight consumer validates the exact completed main-push run using authenticated GitHub API metadata. Reject forks, different workflow paths, SHA mismatch, non-success, stale or superseded runs, and absent or ambiguous artifacts. Check current main and event lineage; do not treat event payload alone as authoritative.
3. Preserve existing exact report and stage checks (zero hard failures, exact reconciliation, ID69 exclusion, both source markers, legacy PDF provenance, cache version, artifact integrity). Record the same evidence; compare against existing consumers in shadow mode before changing any trigger.
4. Authorization-only main push remains the sole publication trigger. The target must be its immediate parent; the changed file set must contain only the authorization file. Require successful exact-target audit and all preflight evidence. Never publish from a workflow_run completion event.
5. Keep existing Git index byte/mode/path checks and HTTPS readback. Do not equate branch push with live publication.

## Migration and measurement

- Phase A: isolated synthetic identity selector tests; no workflow changes.
- Phase B: read-only shadow consumer on trusted completion, with no repository write permission or execution of downloaded artifacts. Compare reports and stage manifests with current preflight.
- Phase C: only after exact-head CI and independent review, replace duplicated waiting for ordinary main pushes; keep existing authorization-only flow and failure behavior until separately reviewed.
- Measure elapsed time from source push to usable evidence and runner-minutes, not timeout values. Retain recovery/retry behavior and reject stale releases.
- No changes to privacy rules, independent hashes, human approval or publication scope.
