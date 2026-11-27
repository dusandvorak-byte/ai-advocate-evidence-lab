#!/usr/bin/env bash
# The same cheap source preparation is used by full builds and verified reuse.
set -euo pipefail
TIMEFORMAT='[prepare timing] elapsed=%3R s'
run_timed() {
  printf '[prepare timing] command: %s\n' "$*"
  time "$@"
}
run_timed node scripts/diagnose-interpelace-380.mjs checkout
run_timed node scripts/recover-historical-binary-blobs.mjs
run_timed node scripts/diagnose-interpelace-380.mjs after-recovery
run_timed node scripts/materialize-godot-pdf-bundle.mjs
run_timed node scripts/materialize-godot-state-bundle-2026-08-24.mjs
run_timed python3 scripts/materialize-uoou-2026-08-26.py
run_timed python3 scripts/materialize-euda-2026-09-25.py
run_timed python3 scripts/materialize-state-pdfs-2026-09-03.py
run_timed node scripts/prepare-md-english-build.mjs
