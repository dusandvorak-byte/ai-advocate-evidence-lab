# Evidence Lab: standalone publication manifest v1 — proposed interface

**Scope:** Development-side interface handoff for issue #293. No production workflow, deployed page, privacy policy, original PDF or permission change is performed here. Sofia coordinates the publishing workstream.

The purpose is to let the publishing pipeline ingest an already approved, immutable PDF batch without waiting for unrelated article/catalog/search CI. This is an **interface candidate**, not a license to publish.

## Contract
- Schema: `schemas/publication-batch-v1.schema.json`.
- Deterministic fail-closed parser: `scripts/validate-publication-batch.mjs`.
- Required per item: stable document ID; issuing party; case IDs; original SHA-256; *separate* public-copy SHA-256; target `documents/...pdf` path; individual privacy-review identity and evidence receipt; human publication authorization explicitly referencing the **same** public-copy SHA; no duplicate IDs, paths or parent traversal.
- A file with the same original/public SHA is unchanged; differing hashes identify a separate derivative and must never be represented as an original.
- This manifest does **not** contain private original PDF bytes. Reviewed public candidate bytes live in approved restricted staging. The actual publisher must verify their SHA-256 and page rendering, check legal/privacy review, preserve ID69 withdrawal and validate exact deployment inventory.
- The fields `receipt` are identifiers **only**. A malicious caller can fabricate strings: the release owner must authenticate receipts with the authoritative approval/review systems, and confirm human identity and approval timing. Static schema/validator does NOT perform that authentication.
- The release owner must bind the manifest to an approved immutable batch identity and to a non-superseded production target. No production merge without separate approval.
- After deployment verify **every** affected PDF URL independently: HTTP 200, downloaded SHA equal to approved public SHA, links work, `.source-commit` and gh-pages identities match.

## Minimal sample shape (fictional, NOT approved)
```json
{
  "schema_version": "1",
  "batch_id": "sample-20261123-not-authorized",
  "items": [{
    "document_id": "doc-example-2026-11-23",
    "issuer": "state",
    "case_ids": ["example-case"],
    "source_original_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "public_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "public_path": "documents/examples/sample.pdf",
    "privacy_review": {
      "decision": "approved_for_publication",
      "reviewer": "example-reviewer",
      "receipt": "example-only-no-proof"
    },
    "approval": {
      "authorized_public_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "authorized_by": "example-authorizer",
      "receipt": "example-only-no-proof"
    }
  }]
}
```

## Engineering workstreams
- **Sofia, release A:** choose an actually already reviewed pilot from authenticated evidence, review restricted public copy, validate human approval, design and release the isolated publisher, reconcile live URL+SHA inventory. No inference of approval from this sample.
- **Johnny, development B:** isolated P1 #286 code fix and negative test for all five independent public digest pins; fix #292 by verifying committed originals and separately pinned post-hardening public bytes without changing the original PDFs; maintain this minimal contract. No runtime deployment or GH Pages writes.
- **Dušan:** approve exact final public-copy SHA and release scope after reviewing privacy evidence, not the act of writing this schema.

## Evidence and verification
Historical interpelace 380 source sha `e5844a961b84628bee2320e6897a4aa52efefa2b616414760655b872ab9b7a71` (2,518,874 B) was independently logged by trusted main run #45223722839 *before* hardening. The public copy produced *after* hardening had SHA `cef92c2a2ad3188c4ec7e071e01aad46e6230a850a8da0652b15dd97efc7f53a` (2,519,002 B); page count remained 2. The second 3-page PDF remained byte-identical. This is a build provenance correction, **not** a new publication approval.

The five already-live output digests for P1 #286 are pinned independently in `scripts/godot-public-sha-pins.mjs`; synthetic tests reject replacing PDF + registry SHA + hardening-report SHA together. CI PASS is required but never a substitute for privacy approval.
