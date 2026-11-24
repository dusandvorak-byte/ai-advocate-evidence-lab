# Release pipeline performance investigation — 2026-11-24

Status: work in progress; no production workflow or release authorization changes until the current release completes. Baseline commit: `4ad97ed3e52c71044975dea612a99b20d04da378`.

## Measured baseline (in-progress run)
GitHub Actions run 45416742987, job 138525094693, completed step timestamps:
- canonical build: 1371 seconds;
- registry public derivatives audit: 260 seconds;
- prepare PDF generator: 16 seconds;
- generated public derivatives audit: 12 seconds.

No completed total or speedup is claimed. Collect final timings for this run and the matching trusted shard diagnostic, including runner queue time and the release gate. Compare both workflows at equivalent input and tool versions.

## Findings from source
- `.github/workflows/validate-evidence-lab-2.yml` lines 330–424 and `.github/workflows/trusted-pdf-shard-diagnostic.yml` lines 49–114 repeat historical PDF materialization, canonical build and final public writers. The latter produces the authoritative staged tree and already distributes the PDF audit to 16 matrix shards. The former launches eight PDF shard processes inside one runner; do not confuse process count with available CPUs.
- `scripts/build-site.mjs` executes many historical materializers and generators serially. The first branch change adds monotonic per-subprocess timing (script name, milliseconds, status only); it does not skip, cache, or reorder any operation.
- `.github/workflows/publish-gh-pages-branch.yml` waits for the authoritative exact-SHA shard run and checks the bound artifact. Its polling loop must explicitly require completed/success after the deadline, not merely a nonempty run ID. Harden separately with regression tests; retain artifact validation.

## Implementation order
1. Profile canonical build subprocesses on isolated inputs, using synthetic fixtures where possible. Identify read/write sets and shared registry dependencies; no parallel writes to the same file.
2. Consolidate duplicate trusted materialization into one authoritative build artifact per exact SHA. Map all checks unique to the existing validation workflow before moving or removing any. Maintain required status checks and failure propagation.
3. Parallelize read-only validations against an immutable, digest-verified staged tree. Benchmark the shard balance and dependency-install overhead rather than increasing concurrency blindly.
4. Design incremental reuse only for independently verifiable public derivatives; key on input bytes, exact tool versions, rules and dependency closure. Never cache private policy, keys, unredacted sources or raw logs. Policy changes, unknown dependencies, invalid cache entries, changes to shared inputs and any mismatch require a full audit.
5. Keep exact owner-approved SHA, privacy/redaction, withdrawn ID69 exclusion, registry/staged set reconciliation, CZ/EN, chronology, links, and live-production verification as mandatory release gates. No authorization-only changes in this branch.
6. Run equivalence and negative tests (tampered PDF, stale policy, revoked approval, missing shard, changed dependency, timeout, failed check), compare full and optimized builds and record wall-clock and runner minutes. Only then propose production integration. Keep the full audit available and scheduled independently without substituting it for mandatory per-release gates.

The target of a few minutes is aspirational, not a measured result. Current release must remain undisturbed; this branch must be rebased/reviewed after it completes.
