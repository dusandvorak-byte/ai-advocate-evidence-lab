# Evidence Lab — Jungle/Jazz UI prototype

**Status:** isolated functional preview, not a public release or canonical registry.

This branch implements the approved light-mode botanical Jungle/Jazz design with an optional first-dark-variant-inspired theme. It is not a replacement for CannaInsider.EU, whose current homepage and publishing rules remain authoritative until a separate content/UX migration is approved.

## Run
Open `prototype/evidence-lab-jungle-ui/index.html` in a browser, or serve this folder with a static HTTP server. No build, credentials, storage, npm dependencies or API calls required.

## Implemented
- Homepage with summary, botanical visual accents, sample cards and design language.
- Demo document archive with local search and status filters.
- Demo document details with metadata, workflow, privacy warning and a **non-PDF** placeholder.
- Light theme as default, manually switchable dark theme; localStorage remembers preference when available.
- Keyboard-accessible links and controls, skip link, responsive layout and reduced-motion support.
- Zero actual documents, uploads, public PDF links, fabricated cryptographic verifications or implied production metrics.

## Architectural boundary
Current public `web/index.html` is a CannaInsider newsroom. It includes built and validated Godot/Justiční slalom surfaces; merging a visual prototype directly into it would violate existing branding/content and potentially publication contracts. This prototype deliberately lives in `prototype/evidence-lab-jungle-ui/`, outside `web/` and `project-memory/`. The normal production release workflow copies only `web/`. The prototype is **never published by this PR**.

## Proposed production integration (separate explicit approval)
1. Independent product/UX review: confirm whether Evidence Lab is separate application, section or new brand; coordinate with Sofie over Slack.
2. Map real public *approved* registry fields to an allowlisted, read-only view model. Server must not expose private documents, workflow drafts, authentication claims or fabricated SHA attestations.
3. Replace demo fixtures only after privacy provenance and release rules are agreed. Use the existing canonical registry; no new shadow database.
4. Apply localized CZ/EN content, mobile accessibility, keyboard navigation and actual device tests.
5. Independent security/content review before any public route change; separate merge and release authorization.
6. Preserve old UI/release path and provide rollback to the last verified SHA.

## Acceptance criteria
Local navigation Home → Archive → Detail → Archive works. Search and status filter narrow only synthetic entries. Theme toggle changes color tokens while preserving layout and aria-pressed state. No user data, upload, live API, source PDF, credentials or publication hooks exist. Visual polish is subject to human review; demo claims are never presented as facts.

## QA pass 2 — route and public registry boundary

- A malformed percent-escaped hash fragment safely falls back to the overview.
- Pressing Enter in the demo search form filters locally without submitting a request.
- `public-registry-contract.mjs` is an **unwired, importable** validator intended for a later approved public-export integration. Only externally attested published copies with explicit privacy/release approval and a 64-character SHA-256 digest survive into a minimal allowlisted view model.
- The validator excludes original-document URLs, source blobs, reviewer identities, contact details and unknown properties. It rejects absolute/protocol-relative/parent-escaping/encoded URLs and impossible calendar dates; duplicate IDs fail closed.
- The security boundary is NOT achieved merely by passing user-supplied `releaseApproved` flags: provenance and approval must originate from a trusted server-side release/export process. The browser must only consume its verified public output.
- Test evidence: `node --test prototype/evidence-lab-jungle-ui/*.test.mjs`. These are structural/contract tests, not browser screenshot or screen-reader certification.

## Visual QA still required

Review at 375, 768, 1024 and 1440 px in an actual browser; verify no overflow, no focus clipping, keyboard-only navigation, 200% zoom, light/dark contrast, Czech and English copy, and all realistic public-record edge cases. No cross-browser or assistive-technology claim until observed.

## Czech / English preview

- `index.html` is the Czech preview and `en.html` the English preview. Both share the same `app.js` and `style.css` and remain static/offline.
- The language link preserves the current hash route (overview, archive, detail, workflow), while the color theme preference remains shared.
- All dynamic sample entries, statuses, date locale, metadata labels and document titles switch with the HTML language. The prototypes do not translate or expose real legal documents.
- Browser QA checks the CZ → EN → CZ round-trip and translation at 375, 768, 1024 and 1440 px. English text is proposed UI copy, not a certified legal translation.
