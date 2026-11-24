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

## First isolated optimization
- Introduced process-local memoization of the existing normalization function and stable reference indexes in PDF reconciliation. No file-read, hash, privacy, owner, date, institution, ambiguity or final-release checks were removed. Index order follows original array order; candidate filtering and duplicate-path handling remain in place.
- Local Node 22.16.0 synthetic regression tests: 3/3 pass. Added the tests to the branch's static PR checks for future Node 24 CI execution. Full build equivalence and trusted CI are still required.
- Single local synthetic benchmark of declared-owner matching (1,000 documents, 1,200 sources): old 1259.4 ms, indexed 3.1 ms, identical ordered results. This measures only the matching kernel, not PDF reconciliation as a whole or overall release performance. No real-world speedup claimed.

## Authoritative diagnostic baseline and consolidation preparation
- Main run 45416742987 was cancelled. Trusted diagnostic 45416743059 succeeded. Release gate 45416743295 succeeded in preflight-only mode; publication and post-publication verification were skipped. These runs are not evidence of deployment.
- Trusted prepare job: 1467 s, including 1411 s for materialization; registry shard: 259 s, including 179 s for its audit; longest PDF shard job: 210 s (134 s PDF audit); assembly: 46 s. These are job/step durations, not additive elapsed wall time for parallel jobs.
- Removed the two standalone OKTE and redacted-analysis steps from legacy validation. Their fragment outputs were not consumed by assembly, which already calls both audit functions and includes both failure lists in the fail-closed summary. Verified those five source-level invariants against the branch; no end-to-end audit rerun yet.
- Extracted 29 original final-web validation step bodies to scripts/validate-final-web-contracts.sh and replaced the original inline block with one invocation. All 29 step bodies were compared against the extracted script; none omitted. Added shell syntax check to static PR validation, not yet executed by CI.
- Next: move shared final-web checks to the authoritative prepare/staged-tree pipeline, compare required checks and non-PDF inputs, retain exact SHA and artifact integrity guarantees, and only then remove the second trusted build. Authorization-only commits need an explicit treatment because the diagnostic workflow ignores them. Until verified, do not merge this branch or modify production.

## Single authoritative build candidate
- The trusted shard workflow now runs the legacy unique syntax and synthetic checks, the pinned private-policy revision check, the canonical build, all 29 final-web contract groups, staging and the 16-shard audit. The legacy main validation job remains a required-status-compatible read-only consumer: it resolves the same exact target SHA as the publisher, waits for a completed successful trusted run, validates its report/staged tree, and preserves the two historical review artifact names. Authorization-only commits reuse the audited immediate parent, not a newly rebuilt tree.
- Source-level comparison confirms one canonical build and one assembler across these workflows, 54 original syntax/test commands retained, all 29 final-contract groups retained before artifact upload, identical target/poll/artifact verification blocks, no publication write permission in the legacy validator, and unchanged PR static test commands. These checks are structural, not an end-to-end trusted build or a speed benchmark.
- Updated lineage regression to test the new single-build contract. No persistent cross-run PDF cache or fast-path audit bypass is implemented yet. Those are a separate gated optimization requiring exact PDF/tool/policy dependency identity, tamper tests and empirical timing. Do not merge the candidate until static CI, independent review and trusted equivalence testing pass. No production authorization is part of this change.
