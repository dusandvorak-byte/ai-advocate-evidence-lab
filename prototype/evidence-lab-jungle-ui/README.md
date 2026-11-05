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
