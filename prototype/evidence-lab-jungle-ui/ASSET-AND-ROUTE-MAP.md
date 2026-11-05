# Evidence Lab × CannaInsider — UX asset map and route architecture
Status: **PROPOSAL / no real image binaries supplied or published**. Coordinated with Sofie on 2026-11-05. The five descriptions below are an inventory from Sofie, NOT image inspection; inspect actual bytes, rights, EXIF and text legibility once files are approved and transferred.

## Product split and navigation

**Decision candidate:** keep `https://cannainsider.eu/` as the editorial canonical homepage; ship Evidence Lab later as a *separate clearly marked evidence section* (proposed `https://cannainsider.eu/evidence-lab/` only after route approval) or a separately controlled application. Do not replace current homepage, Godot or Justiční slalom. Never make demo records look like verified public records.

| Context | CZ proposed route | EN proposed route | Reason / legacy preservation |
|---|---|---|---|
| CannaInsider newsroom | `/` | `/en.html` (existing, verify exact live link) | Unmodified canonical newsroom |
| Evidence Lab landing | `/evidence-lab/` | `/evidence-lab/en.html` | Proposed; does **not** exist live |
| Evidence Lab public archive | `/evidence-lab/#dokumenty` | `/evidence-lab/en.html#dokumenty` | Proposed prototype hash navigation, canonical IDs shared |
| Evidence Lab public detail | `/evidence-lab/#detail/<public-id>` | `/evidence-lab/en.html#detail/<public-id>` | Proposed demo pattern; production URL design needs approval (hash not canonical SEO) |
| Workflow explanation | `/evidence-lab/#workflow` | `/evidence-lab/en.html#workflow` | Explained as target architecture, not live backend |
| Godot news / document source | Existing canonical paths; discover exact per-page target from registry | Existing canonical EN routes | Deep-link there, do not clone content or redirect originals |
| Justiční slalom | Existing `zpravy/04082026-010.html` anchored sections (verify exact page) | Existing `news/04082026-010.html` anchored sections (verify exact page) | Keep legacy anchors and public PDF URLs byte-identical |

**Integration rules:** No automatic redirects, rewrites, rename, CDN purges, migration of original PDF files, or duplicate canonical IDs. Record `originCanonicalUrl` and `publicCopyUrl` separately (both read-only, from a trusted approved export) and show what is an original vs. redacted/public copy. URL switching must retain selected document ID, not silently load a different locale-specific record. No legal document translation is implied by switching UI language. Every new route needs link checks in both languages and a rollback to the last passing public SHA.

## Image map — five originals only, no generative substitutes

| Asset / reported dimensions | Priority and ideal location | Media treatment | A11y / editorial constraint |
|---|---|---|---|
| **Konopí.jpeg** 720×450 | **P1 botanical opener**: full-width/half-width editorial strip *below* the hero; calmer evidence-app hero keeps real navigation and page title prominent | `object-fit: contain` for original gallery; optional approved responsive `cover` crop of foliage ONLY in decorative component with separate real full-image view | No text embedded in pixels; editorial HTML overlay outside image; check contrast with both themes and crop at 375px |
| **Policie.jpeg** 720×810 | **P2 topic card**: police / evidence section and related article; not generic home hero | Portrait card using `contain` by default, visible subject not cut; never imply photo proves a particular person's wrongdoing | Contextual factual caption, credit and publication consent; neutral alt text; no face/person identification |
| **Srdce.jpeg** 310×193 | **P3 narrative interlude** alongside `Státu lásky čas` with standalone explanatory caption, not an icon replacing UI controls | Entire original shown, natural ratio 310:193, never upscale far beyond intrinsic resolution | Confirm creator rights, semantic alt in CZ/EN (English title: “State, It’s Time for Love” with original title shown) |
| **Verze 17.11.2026…jpeg** 1086×1448 | **P4 editorial gallery / satirical artwork** as a full separate work (never use for a card crop or decorative texture) | `object-fit:contain`, width limited by original, original 1086:1448 ratio, optional open-in-new-tab of exact byte source only after rights/privacy approval | Preserve faces, central Tree, captions, layout; mark **political satire, not a verified factual claim**; source title date 17 Nov 2026 is future relative to 5 Nov 2026 — do not imply already published |
| **war is over.jpeg** 720×511 | **P5 advocacy section** after article context, presented distinctly from Evidence Lab's evidence records | Show image in full at natural aspect ratio; no edited lettering, note staff or slogan | HTML caption explaining advocacy graphic, attribution and rights. Do not present slogan as an evidence finding |

### UX hierarchy

1. **Hero:** immediate meaning (what Evidence Lab does), readable title, single primary action “Browse evidence”, secondary “How verification works”. Static scale illustration from existing prototype may remain until actual assets are cleared. A police photo should not become the hero.
2. **Evidence flow:** search, verified-status labels, source/copy distinction, clear provenance, and filter results. No fabricated verification badges.
3. **Thematic visual story:** botanical art introduces context; historical/art/political imagery is connected to an explicitly labelled editorial narrative rather than legal evidence.
4. **Contextual media gallery:** five **source-owned** originals, captions and credits. Start from consent and confirmed file existence. Gallery must be optional and must not prevent access to evidence.
5. **Dark mode:** retain true text contrast and original art pixels, change only UI surface/tokens. Do not invert the images themselves.

### Responsive and accessibility contract

- 375px: one column, all original artworks use full-width `contain`, never truncate caption, all controls >=44×44 CSS px, no text directly on unknown image areas.
- 768px: two-column for low-text cards but poster keeps full readable width and complete ratio; no automatic poster cover crops.
- 1024px/1440px: max-width editorial content 1120–1280px, posters still `contain` and <=1086px native width; use whitespace, avoid upscale 310px heart image.
- All media `loading=lazy` except an approved hero, set `width` and `height` to prevent CLS. Provide captions separate from alt; accessibility and user respects `prefers-reduced-motion`. No autoplay, flashing motion, animated zoom, parallax or attention hijack.
- Browser tests: CZ↔EN, light↔dark, keyboard focus, 200% zoom, 375/768/1024/1440 px no overflow; verify every item keeps full aspect ratio and readable source text.
- Copy: commentary/satire explicitly attributed, never treated as primary evidentiary fact. Source/legal claims retain original wordings, no invented translations.

## Approval, intake and rollback gates

- **Pending:** Dušan identifies licensed files and explicitly confirms destination + right to publish; Sofie delivers original bytes with SHA-256, file names, dimensions, attribution, any alt-text/editorial approvals, and confirms privacy/rights. No copying from a chat description.
- Normalize filenames only in a *new immutable manifest*, never change image pixels or rename canonical originals. Keep `sourceFilename`, `sha256`, `mime`, `width`, `height`, `licenseReview`, `captionReview`, `approvalReference`. Do not commit personal EXIF or private sources by accident.
- Implement image rendering only after real bytes arrive, and only in isolated branch. The frontend is designed to fail closed if assets missing: **no fabricated replacement photos**, no broken image icons.
- Publish behind separately authorized route; smoke-test in preview first, then check canonical homepage, all PDF URLs and source/public hashes. To roll back, restore last verified SHA and previous navigation, keep immutable public PDF originals unmodified. Publish/merge requires separate Dušan approval.

## Open decisions for Sofie/Dušan
1. Approve app location `/evidence-lab/` vs subdomain (example only, NOT provisioned), and choose editorial links that appear on CannaInsider.
2. Confirm final byte transfer path and whether all five images may appear publicly; editorial and copyright/privacy approval per image.
3. Assign canonical publication URL for artwork and poster; whether image is public-domain, licensed or solely previewable.
4. Verify the exact Godot / Justiční slalom live deep links and CZ/EN source links before any redirects.
