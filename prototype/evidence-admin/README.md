# Evidence Lab — Phase 1 isolated administration prototype

**Status:** demonstration only, not an authenticated administrator application, upload service or publish system.

Open `index.html` using a local HTTP server (ES modules require HTTP); use **synthetic metadata only**. Nothing is uploaded, stored or sent to GitHub. The form shows JSON in memory. Never enter real personal or legally sensitive documents.

## Tests
```sh
node --test prototype/evidence-admin/validate.test.mjs
```
No dependencies and no new GitHub Actions workflow are introduced. Files live outside `web/` and cannot appear in current GitHub Pages output, which publishes only `web/`.

## Integration proposal, not implemented
1. Authenticated backend with MFA, CSRF protection, scoped permissions, size limits, MIME+magic/signature checks and content scanning.
2. Immutable original in private storage outside the GitHub Pages published path; SHA-256, audit log and deduplication policy.
3. Separate redacted/public copy with second hash, trained human privacy review and verification of embedded PDF text and metadata.
4. Validate `institution_id` against `project-memory/institutions.json`; map approved intake records to `project-memory/document-schema.json` through a versioned adapter.
5. Use dedicated PR with pinned source commit and tests. Editor approval is not deployment approval. Never push to main/gh-pages from this service.
6. Record independently verified GitHub Actions run, public URL/hash, and rollback target.

State model (future backend): draft -> scanning -> metadata_review -> privacy_review -> ready_for_approval -> approved -> publishing -> published; quarantined/rejected/publication_failed are controlled failure states. Any substantive edit invalidates prior approvals.

## Differences from canonical schema
The current canonical schema and `scripts/register-document.mjs` remain unchanged. This intake schema is **not** a direct extension to the public source of truth; it is staging-only. In particular, `requested_state: review` has no power to publish.

## Boundaries / decisions
- No real PDF input is included by design until secure backend exists.
- Real file storage provider, encryption keys, backup RPO/RTO, domain/VEDOS settings and identity provider require separate review.
- Do not merge before code review and verification that current publish workflow cannot deploy these prototype files.
- A later phase should use a full JSON Schema validator on the backend; client-side checks are UX only.
