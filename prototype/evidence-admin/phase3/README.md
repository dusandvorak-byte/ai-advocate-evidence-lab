# Evidence Admin Phase 3 — secure backend foundation (SYNTHETIC ONLY)

## Safety boundary

This is a source-only, *non-deployable* foundation. It has **no HTTP listener, no Dockerfile,
no credentials, no environment variables, no live database connection, no migrations executed,
no S3 client credentials, no hosted malware scanner and no publishing endpoint**. Only marked
`DEMO:` / `DEMO-` metadata and `%EVIDENCE-LAB-TEST-ONLY` PDF fixtures are accepted.
All other documents are rejected, even if PDF magic is valid. Existing Phase 2 demo remains untouched.

The project's public GitHub Pages is **not** a backend or private file store.

## Contracts and architecture

* `identity.mjs`: `authenticateOidc` accepts a *verified* JWT from an injected verifier. That
  integration must enforce signature algorithms, JWKS/key rotation and actual token type. This
  layer checks issuer, audience, time claims and MFA, then resolves roles only from server-side
  identity management. Never accept browser-supplied roles. No real OIDC adapter is bundled.
* `migrations/001_secure_intake.sql`: PostgreSQL schema for metadata, locked versions, separate
  append-only audit table and restrictions. It is **not executed by CI**. Database owner privileges,
  role grants, backups, RLS, encryption-at-rest and restore tests remain production launch gates.
* `repository.mjs`: injected PostgreSQL client/pool; `SELECT ... FOR UPDATE`, expected-version
  compare-and-swap, state machine from Phase 2, and audit INSERT within the **same transaction**.
  A separate **trusted** receipt verifier is required for every scan transition.
* `quarantine.mjs`: S3-compatible private adapter, random quarantine key, requested KMS
  encryption and absence of public ACL. These options **must be enforced by the bucket policy**,
  not trusted from a calling app. Ingest is synthetic only; database failure attempts a
  compensating object deletion and surfaces reconciliation failure if cleanup fails.
* Scanner interface: `scanPrivateObject` produces a scoped receipt; `verifyReceipt` must
  authenticate scanner-originated evidence. A scan result of "error" cannot be promoted to clean.
* Review roles: uploader != metadata reviewer != privacy reviewer != publisher. Persistent audit
  writes occur in the same transaction as state transitions; no event implies public publication.

## Status / acceptance criteria

| Control | Included in Phase 3 | Still needed before real data |
|---|---|---|
| OIDC/MFA/RBAC | Verified-claims, MFA policy, server role contract | Provider selection, JWKS/JWT implementation, session lifecycle |
| PostgreSQL | SQL migration, transactional repository | Real PG integration tests, least privilege, encrypted backups, RLS/grants |
| S3 | Private KMS upload and cleanup interface | S3 adapter SDK, private bucket policy, lifecycle, encryption verification |
| Malware scanning | Trusted receipt boundary and mandatory scan for transition | Isolated scanner service, AV engine/version, signatures, timeouts and retries |
| Audit | Same-transaction append-only log and DB trigger | Immutable external backups, access control, tamper evidence, retention policy |
| Review | Independent-role transitions | Manual public copy inspection UI and signed reviewer decision evidence |
| Publication | Explicitly not implemented | Separate review and user-approved deployment/publish integration |

## Threats / controls

- Forged client roles or JWTs -> identity roles only from trusted server directory; JWT verifier is mandatory.
- Forged scanner result -> external receipt verifier required; no clean promotion on unchecked verdict.
- Concurrent reviewers -> row lock and CAS version guard prevent lost updates.
- Sensitive documents in public repository -> no real document storage, no public link, no publication action.
- Partial S3/DB write -> best-effort compensating deletion; reconciliation required if cleanup fails.
- Lost or manipulated audit -> transactional insert + append-only DB trigger; production role/grants and
  independent tamper-proof archival are **not yet implemented**.
- PDF exploitation -> magic/EOF and size are **not malware detection**; real data stays prohibited.

## Testing / CI

```sh
node --test prototype/evidence-admin/phase3/phase3.test.mjs
node --test prototype/evidence-admin/backend/backend.test.mjs
node --test prototype/evidence-admin/backend/local-demo-api.test.mjs
```

Dedicated workflow validates Node syntax, role / OIDC boundary, unsafe file rejection,
private object options, trusted scanner receipt, independent review actors, transactional audit
and compensating cleanup with synthetic mocks. It never executes SQL migrations or deploys.


## Isolated integration expansion (same Draft PR)

- `oidc-jwks.mjs` verifies RS256 JWS using Node's public-key crypto and an injected, pretrusted JWKS; it rejects forged signatures, wrong audience, expired tokens, unsupported algorithms and key-selection ambiguity. The JWKS discovery/HTTPS pinning, cache, rotation, revocation, token type policy and issuer tenant onboarding are **not** implemented.
- `scanner-receipt.mjs` verifies an HMAC-protected receipt including object key, digest, verdict and a five-minute maximum validity. Tests use a synthetic key; production should use independent scanner identity, KMS/rotated keys, and a persisted replay ledger.
- `s3-adapter.mjs` creates AWS SDK v3-compatible PutObject/DeleteObject commands with private-only quarantine paths, KMS envelope encryption options and no public ACL. The SDK and real network adapter are not bundled, no real bucket is accessed, and no bucket policy/retention claim is made.
- `migrations/002_postgres_ci_checks.sql` runs against an ephemeral PostgreSQL 16 CI service, proving schema migration, savepoint rollback of both intake state and audit record, no-update audit trigger and object-key constraints. It does **not** execute the Node repository through a real `pg` Pool; that end-to-end verification remains a future gate.
- `integrations.test.mjs` tests a real RSA signature, tampering, MFA identity integration, scanner MAC and private S3 SDK command mapping without any external services.

**Non-negotiable deployment gate:** Real sensitive documents, production identities, real AWS credentials, and migrations of an existing database remain prohibited pending separate review and approval.

## Future deployment approval gates

1. Owner authorizes hosting and data location/retention. Need DPA/processor inventory for personal data.
2. Auth/security owner selects OIDC provider, MFA, token verification and least-privilege DB roles.
3. Dedicated isolated quarantine storage, scanner and threat-tested PDF parser.
4. S3 write receipt and DB atomicity reconciliation; scheduled orphan sweeper and alerting.
5. PostgreSQL integration tests and migration rollback in disposable environment.
6. Privacy redaction/public copy workflow + complete provenance evidence.
7. Backup restore drill, security tests, audit retention, incident response and user acceptance.
8. Separate approval for merge, live credentials, hosting, DNS and production deployment.

No existing project configuration or user content has been modified beyond this draft PR.
