# Evidence Lab 3.0 — clean publication branch

This tree contains only a new single-job rehearsal, a standard-library delta builder, tests and this README. No legacy materialization, shard, publish or generator workflow is inherited. The Git parent is the pinned published snapshot for lineage only; the working tree is replaced rather than copied.

The first test uses one deterministic synthetic PDF and a separate chronological preview index. It verifies the authenticated historical baseline manifest and hashes the exact historical published checkout, then emits only three new files. It does not publish to gh-pages, accept real PDF inputs, change existing chronology, or claim present-day privacy clearance. The five-minute workflow timeout is a test target, not a measured live deployment SLA.

Production next: trusted one-document audit with current private policy and engine; exact human approval of public bytes and metadata; safe structured integration into existing CZ/EN chronology and registry; exact delta and withdrawal reconciliation; protected atomic publication with rollback and live verification. Unchanged PDF bytes may be reused only with authenticated current-policy machine evidence. Do not copy raw documents into this public branch; submit only reviewed public copies through the future controlled intake.

Baseline: archive/v3-published-seed-2026-11-27. The current live website and legacy workflows remain untouched.
