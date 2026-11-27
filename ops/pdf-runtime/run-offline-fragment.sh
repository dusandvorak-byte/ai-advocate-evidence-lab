#!/usr/bin/env bash
# Trusted offline final PDF fragment checks. No token, network or writeable source mount.
set -euo pipefail
image=${EVIDENCE_LAB_PDF_RUNTIME_IMAGE:?missing immutable image}
[[ "$image" =~ ^ghcr\.io/dusandvorak-byte/ai-advocate-evidence-lab/pdf-runtime@sha256:[0-9a-f]{64}$ ]]
[[ "$GITHUB_EVENT_NAME" == push && "$GITHUB_REF" == refs/heads/main && "$GITHUB_REPOSITORY" == dusandvorak-byte/ai-advocate-evidence-lab ]]
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
[[ $# == 1 && "$1" == generated || $# == 3 && "$1" == pdf-shard && "$2" =~ ^([0-9]|1[0-5])$ && "$3" == 16 ]]
font=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
printf '%s  %s\n' ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280 "$font" | sha256sum -c
policy="$RUNNER_TEMP/evidence-lab-private-redaction-policy.json"
test "$EVIDENCE_LAB_PRIVATE_REDACTION_POLICY" = "$policy"
test -f "$policy" && test ! -L "$policy" && test "$(stat -c %a "$policy")" = 600
test -n "$EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY"
mkdir -p "$GITHUB_WORKSPACE/review-artifacts/release-audit-fragments"
args=(run --rm --pull never --user "$(id -u):$(id -g)" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=2g -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1)
args+=(-v "$GITHUB_WORKSPACE:$GITHUB_WORKSPACE:ro" -v "$GITHUB_WORKSPACE/review-artifacts/release-audit-fragments:$GITHUB_WORKSPACE/review-artifacts/release-audit-fragments:rw" -v "$policy:$policy:ro" -v "$font:/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:ro" -w "$GITHUB_WORKSPACE")
if [[ "$1" == pdf-shard ]]; then
  args+=(-v "$RUNNER_TEMP/compact-shard-bundle:$RUNNER_TEMP/compact-shard-bundle:ro" -v "$RUNNER_TEMP/compact-shard-stage:$RUNNER_TEMP/compact-shard-stage:ro")
fi
for name in GITHUB_ACTIONS GITHUB_EVENT_NAME GITHUB_REF GITHUB_REPOSITORY GITHUB_WORKFLOW_REF GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_SHA GITHUB_WORKSPACE RUNNER_TEMP EVIDENCE_LAB_PRIVATE_REDACTION_POLICY EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY EVIDENCE_LAB_SHARD_COST_MEASURE EVIDENCE_LAB_SHARD_COST_SCHEDULE EVIDENCE_LAB_MINIMAL_SHARD_TRANSPORT EVIDENCE_LAB_SHARD_MANIFEST_SHA256 EVIDENCE_LAB_SHARD_BUNDLE EVIDENCE_LAB_CANONICAL_REGISTRY EVIDENCE_LAB_PUBLICATION_ROOT; do
  if [[ -v "$name" ]]; then args+=(-e "$name"); fi
done
docker "${args[@]}" "$image" python3 scripts/audit-release-evidence-sliced.py "$@"
