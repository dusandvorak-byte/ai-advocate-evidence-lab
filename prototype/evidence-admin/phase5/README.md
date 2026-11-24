# Phase 5 — Lease/ack recovery (synthetic only)

This isolated foundation adds **an at-least-once outbox protocol**. It cannot be
deployed or connected to actual legal documents. There is no HTTP service,
production pool/client, real scanner, external dispatcher or real credentials.

## Exact scope
- `migrations/005_leases.sql`: additive PostgreSQL lease token, deadline, backoff
  scheduling, dead-letter state and bounded failure class.
- `leased-outbox.mjs`: one-statement atomic `FOR UPDATE SKIP LOCKED` claim,
  commit-before-dispatch, lease-token-fenced acknowledgment, exponential retry,
  dead-letter after bounded attempts.
- `leased-outbox.test.mjs`: fake-PG functional tests for two-worker exclusion,
  expired lease fencing, bounded retry, poison messages and ack failure after
  successful delivery.
- `migrations/006_phase5_ci_checks.sql`: real disposable PostgreSQL 16 claim,
  lease exclusivity, stale-owner rejection and successful acknowledgment.
- `.github/workflows/validate-evidence-admin-phase5.yml`: synthetic-only CI.

No `web/`, `project-memory/`, PDFs, GitHub Pages publishing workflow,
DNS/WEDOS, actual tokens, DB credentials, storage keys or deployment changes.

## Invariants / limitations
1. Claim transaction is committed before `dispatch` (one SQL UPDATE claim).
2. Acknowledge/NACK uses the *exact current lease token* and an unexpired lease.
   Stale workers cannot acknowledge after the lease is reclaimed.
3. `dispatch` receives only `idempotencyKey`, intake ID, state and version.
   It is a synthetic injected callback, **not a real event bus or publisher**.
4. If dispatch succeeds but ACK fails or lease expires, delivery repeats.
   There is **no exactly-once delivery**. The eventual production consumer must
   persist a durable dedupe ledger by `idempotencyKey` and enforce idempotence
   at the side-effect boundary. The existing Phase 4 worker must not be
   connected to production dispatch.
5. Transient failure follows bounded exponential retry; poison messages
   dead-letter and require operator review. There is no automatic publication,
   deletion, storage release or compensating production mutation.
6. CI tests real SQL migration/lease fencing on PostgreSQL 16, but **does not**
   run a live Node `pg` driver or simulate a real process kill across workers.
   That remains an explicit production gate.

## Remaining required evidence before production
- Real `pg` integration across independent connections and worker crash/restart.
- Dedicated consumer durable dedupe and lease extension/heartbeat strategy for
  operations exceeding max lease duration; dead-letter alerting, retry metrics.
- Least-privilege DB grants/RLS where necessary, migration rollback plan,
  lock-timeout tuning, restore drills and retention controls.
- OIDC/JWKS, scanner, storage provider verification; private bucket policies,
  reconciliation of orphan objects, trust-key rotation.
- Privacy/redaction and public release approval by human owner.
- Independent security review. A green CI is not a merge or deploy approval.
