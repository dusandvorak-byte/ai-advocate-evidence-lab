# Persistent PDF audit ledger — isolated development

Baseline: main commit 6720f1febbd2782f5a234da8d8925d18b856f50c. No main changes and no live publication authorization in this branch.

## Measured motivation

Trusted run 45456727472: hardening 1395.050 s of canonical build 1405.303 s. 389 physical PDFs inspected and 306 public copies rewritten. Do not confuse that measurement with a proven cache speedup.

## Two distinct stores

- Machine facts: PDF SHA-256 + authenticated private-policy identity + public policy source SHA-256 + engine fingerprint. The latter conservatively covers repository Python code, policy contract, runner image, OS package set, Python package metadata, PDF tool binaries/versions, font bytes. This is a conservative prototype; installed dependency contents and all shared-library dependencies still need validation before allowing skipped scans.
- Transformation: adds exact pre-hardening registry context, path-specific contract digest, source SHA and path. Stores only previously verified public bytes and signed machine transformation proof. Initially allows structural/metadata-only repairs; never raw originals, text fallback, known pinned late/OKTE/interpellation special paths or private rule material.

Both stores are HMAC-authenticated with a dedicated key and must live outside the checkout and web tree in private durable storage. Invalid entries are misses. Human privacy review, owner approval, withdrawn IDs, canonical registry identity and current path-dependent checks are never cached as grants.

## Current integration

The final audit's pdf_facts function has opt-in shadow integration: fresh scans are still authoritative, semantic equality and timing measured by process-local stats. The standalone transformation ledger has a validated candidate reader, but does not write production PDFs or issue its own trusted audit proof. Tests are synthetic and have no production secrets. No cache is provisioned on main.

## Required next steps before activation

1. Implement trusted producer that binds fresh machine facts and transformation source/context snapshots to an actual completed successful audit, and signs only those entries. Validate archive provenance, exact required check names, all dependencies, approved scope and revocation policy; never sign supplied arbitrary facts.
2. Provision dedicated secret and durable access-restricted store. Do not use public git branches for private audit metadata. GitHub Actions artifacts/caches alone have retention/eviction, not permanent storage. No persistent backend currently provisioned.
3. Export aggregate shadow metrics without content or policy values. Run two equivalent trusted builds (cold/warm), compare reports, final tree and proof labels. Test changed bytes/policy/tool versions, corrupt entries, withdrawn document, failure/timeout and cache miss. All failures must fall back to fresh audit or fail closed.
4. Enable limited cache consumption only after independent review, matching results and measurable performance. Do not treat cached machine results as privacy approval. Full release authorization and live verification remain mandatory.
5. Extend the hardener to use authenticated transformation candidates, first in isolated comparisons, with exact source SHA recheck and same-path atomic commit. Never apply the prototype directly to production.

No production time saving is claimed yet.
