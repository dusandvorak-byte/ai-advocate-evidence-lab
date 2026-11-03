# Phase 2 — local demonstration backend (stacked on PR #167)

## Operational boundary

This is an intentionally **non-deployable** local-only HTTP demonstration. It does not store PDFs or accept legal documents. It does not perform malware scanning and cannot advance a review beyond `scanning`. It is not a production security control.

The API factory is exported for automated tests and **does not open a port on import**. The test suite explicitly listens on `127.0.0.1` with an ephemeral port. No Dockerfile, service unit, credentials, deployment workflow or VEDOS integration are supplied.

## Implemented endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/healthz` | Local demo marker only |
| POST | `/v1/demo/intakes` | Authenticated editor creates synthetic metadata in memory |
| GET | `/v1/demo/intakes/:id` | Reads synthetic metadata for originating actor |
| POST | `/v1/demo/intakes/:id/quarantine` | Checks synthetic PDF and moves in-memory state to `scanning`, without storing bytes |

There are **no** file-download, antivirus-result, approval, publish, GitHub, filesystem or external-network actions.

## Access and abuse resistance

- Explicit caller-supplied test credentials of 32+ characters; no default credentials, secrets or credentials file.
- Bearer auth with timing-safe comparison; roles derived exclusively from server configuration, not request JSON.
- Loopback clients only; tests bind `127.0.0.1`. No CORS access is enabled.
- Strict synthetic metadata (`DEMO: ...` and `DEMO-...`) with fixed allowed fields.
- Single synthetic PDF marker `%EVIDENCE-LAB-TEST-ONLY`; malformed, unmarked, oversized (128 KiB) and wrong-MIME input rejected.
- PDF content not persisted. Only transient in-memory metadata, document hash and `scanning` status returned.
- Response cache disabled, sniffing disabled, request/header time limits set.
- The pure state machine in PR #167 also requires different people for metadata review, privacy review and final approval. Roles supplied to this function must come from a trusted identity boundary.

## Explicit limitations / production blockers

1. This is *not* OIDC/MFA, session management or production authorization. Hard-coded test credentials in tests are synthetic and invalid for real deployment.
2. PDF header and EOF checks are not deep PDF parsing, malware detection or decompression-bomb protection.
3. There is no private encrypted object storage, scanner receipt, durable audit, transaction isolation, backpressure to a storage target, retention, backup or restore.
4. The synthetic marker can appear in arbitrary bytes; it is solely an anti-accident guardrail, not malware defense.
5. Real metadata and real PDFs are prohibited. Using this for actual documents requires a separate approved architecture and security review.
6. This branch is stacked on the unmerged PR #167 and must be rebased/retargeted after its merge, not independently merged into production.

## Test commands

```sh
node --test prototype/evidence-admin/backend/backend.test.mjs
node --test prototype/evidence-admin/backend/local-demo-api.test.mjs
```

CI must pass on the precise pull request HEAD. PR review and explicit merge approval remain separate gates.
