# Evidence Lab phase 2 — backend security boundary (development only)

## What is implemented
- Pure PDF pre-quarantine gate checks Buffer, exact content type, 20 MiB size, PDF header, EOF marker, computes SHA-256.
- Pure review state machine enforces sequence, role checks, version (optimistic concurrency), scan evidence, human review of the public copy and separation from submission author.
- Automated tests with **synthetic PDF bytes only**.
- No network listeners, upload routes, credentials, storage, PDF parsing, antivirus integration, GitHub writes or production deployment.

**Warning:** magic bytes + EOF checks do not prove a PDF is safe or even parseable. No real upload shall be accepted until sandboxed deep parsing, malware scan, limits, authentication, storage encryption and a human review pipeline are implemented. The gate's `accepted` means *eligible for quarantine only*, not accepted as safe or publishable.

## Next interface contracts (design only)
- `POST /api/v1/intakes`: authenticated editor, JSON metadata; server-generated UUID and audit event, server-side JSON Schema validation.
- `POST /api/v1/intakes/:id/original`: authenticated editor, single-stream, bounded upload to private quarantine; no public URL; MIME/magic/size verification, private checksum; on failure atomic cleanup. Requires CSRF protection and rate limits.
- `POST /api/v1/intakes/:id/scan-result`: restricted scanner service identity; signed/verifiable scanner receipt and immutable artifact hash.
- `POST /api/v1/intakes/:id/review`: role-scoped transition, requires `expectedVersion` for atomic compare-and-swap, durable audit event, and MFA for final approval.
- `GET /api/v1/intakes/:id`: authenticated role-scoped metadata only. File download requires separate logged authorization.
- Publication PR API: deferred. Backend must **never** have credentials to push to `main` or `gh-pages`.

## End-to-end target
Browser -> isolated authenticated API -> quarantine -> structural PDF parse and AV sandbox -> immutable encrypted original -> separately redacted public derivative -> manual privacy/content approval -> reviewed PR -> existing GitHub CI -> explicit separately authorized merge -> public smoke check.

## Threat model and implementation gates
- Actors: editor, scanner service, metadata reviewer, privacy reviewer, publisher.
- Controls: OIDC/MFA, session cookies HttpOnly/Secure/SameSite and anti-CSRF; least-privilege scoped service credentials; signed scanner receipts; upload bytes/stream/time limits and PDF bomb checks; audit chain; immutable object versions; idempotency; SHA-256 dedup handling.
- Reject SVG/HTML/polyglot files, executable PDF actions, embedded files, JavaScript and encrypted/password-protected PDFs until safe parsing policy established.
- Metadata is personal/legal data. Avoid logging filenames, raw document text or third-party identifiers.
- Don't expose originals to GitHub, GitHub Actions artifacts, build output or publicly linked endpoints.
- Atomic durable audit and concurrency control must be implemented before a persistent API is enabled.
- RPO/RTO, key storage, backup and restore proof, scanning engine, tenancy, retention and VEDOS domain access remain open decisions.

## Acceptance criteria for deployable backend (not yet met)
1. All authentication and authorization enforced server-side and tested.
2. Safe PDF acceptance to quarantined private storage only; malware/structure checks and strong limits.
3. Immutable originals and separately hashed redacted public derivatives.
4. Human privacy/content review independent of the submitter, durable revision approvals.
5. End-to-end audit receipts, deletion/retention policy and restore test.
6. No publication without exact-commit CI + explicit merge authorization.
7. Independent security review and staged deployment approval.

## How to test
```sh
node --check prototype/evidence-admin/backend/pdf-gate.mjs
node --check prototype/evidence-admin/backend/review-workflow.mjs
node --test prototype/evidence-admin/backend/backend.test.mjs
```
