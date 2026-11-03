# Live PDF SHA-256 propagation verification — 2026-11-03

## Incident evidence
Run `41615461821` on commit `abdcb49cdecf5a1549dba958968b275bf88af8df` published `gh-pages`, then failed in the live smoke-check step for PDF `105-podani-2026-10-15-police-thc-trestni-podnet-redigovany-original.pdf`.

Expected SHA-256: `db3ed5bf5a8bc7837e9848e972c92dd807bc9efd5b7ea25a9e47a5831c0a51a4`.
Live SHA-256 at failure: `61d239b0bf8729bdf53b47a9f6237663b1ae1cfb22254de396cbc6e52c5fb1d2`.

The `gh-pages` branch commit points to that source commit, but this does not by itself prove the specific PDF's byte identity. Live CDN download was unavailable from our local workspace; definitive incident cause is **unconfirmed**.

## Fix proposal (no change to real PDFs)
1. Immediately after publication, fetch the current `gh-pages` Git tree and compare the PDF blob's SHA-256 with the built file. Any difference is an immediate hard failure: bad artifact or wrong path, **not** CDN lag.
2. If the tree matches, test the live URL with a unique query parameter on each attempt, for at most 36 attempts with 10-second spacing. Every response must match the local SHA-256 exactly.
3. Only byte-identical responses are written to the old `/tmp/live-police-1015.pdf` path for downstream checks. Persistent mismatches, HTTP failures or timeouts remain fatal.
4. Added synthetic-only tests for propagation delay, permanent mismatch, optional source marker, HTTP failure, wrong URL, and safe output retention.

## Limits and rollback
- Only this one PDF live verification call is replaced; others retain existing behavior.
- No PDF source, canonical data, DNS, hosting, secrets, `main` or `gh-pages` is modified by the draft.
- PR CI uses synthetic bytes; it does **not** perform a live production publish.
- A future approved merge of this workflow change would trigger the repository's existing publishing workflow. Explicit merge approval is separate.
- Rollback: revert the reviewed workflow/helper/test commits; never drop a hash assertion to recover a green status.
