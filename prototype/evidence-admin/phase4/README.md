# Phase 4 — integration hardening (synthetic only)

This source-only layer extends Phase 3. **No real PDFs, credentials, deployments, WEDOS/DNS, website content or public publication**. No live HTTP endpoint. GitHub Pages remains a public static site.

## Scope / exact changed paths
- `phase4/migrations/003_receipts_outbox.sql`: durable, unique scanner receipt ledger and transactional outbox.
- `phase4/durable-review.mjs`: independent receipt verifier, SQL `SELECT ... FOR UPDATE`, version CAS, consume-once scanner receipt, audit and outbox event in a single transaction.
- `phase4/outbox.mjs`: synthetic injected idempotent dispatcher and read-only stuck-intake report; explicitly **not** safe to wire to real external effects without leases, retries and durable dedupe.
- `phase4/migrations/004_phase4_ci_checks.sql`: PostgreSQL uniqueness and rollback assertions.
- `phase4/phase4.test.mjs`: synthetic negative/rollback scenarios.
- `.github/workflows/validate-evidence-admin-phase4.yml`: isolated Node 24 and disposable PostgreSQL 16 CI.

No edits to `web/`, `project-memory/`, publishing workflows, legal data or the public document pipeline. Changes are coordinated with Sofie via Slack.

## Security properties verified in test environment

1. A receipt must be verified by a trusted independent verifier, match the exact intake, object key, SHA256 and verdict, and be consumed once in the SQL transaction.
2. Intake state, audited transition, consumed scan receipt and outbox event share one SQL transaction. Failure rolls back everything; optimistic version checking prevents stale transitions.
3. The outbox provides at-least-once semantics; its callback is injected and must be **idempotent by event ID**. There is no public publishing adapter.
4. Stale quarantine is read-only reporting. No automatic deletion, declassification or release.
5. All tests use synthetic identities, scanner receipts and data. SQL runs only inside throwaway CI containers.

## Remaining blockers to production / deployment

- Real Node `pg` Pool integration tests under parallel workers and abrupt termination.
- S3 and DB consistency / orphan discovery and durable reconciliation with explicit operator approval.
- Scanner attestation lifecycle, key rotation, replay resistance across scanner identities, scan timeout handling.
- OIDC discovery/JWKS rotation, audience and token type policy, revocation, role provisioning and offboarding.
- PostgreSQL least-privilege roles, grants/RLS where required, encrypted backups, retention, audit export/immutability and restore rehearsal.
- External outbox worker lease, crash recovery, backoff, poison-message routing and side-effect deduplication.
- Legal content redaction and approval owned by Sofie; public publication is a separate human decision.

CI success is **not** authorization to merge, deploy, handle actual legal data, change DNS/WEDOS or issue credentials. The PR remains Draft.
