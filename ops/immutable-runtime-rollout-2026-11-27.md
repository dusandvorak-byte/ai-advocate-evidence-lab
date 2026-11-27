# Immutable PDF runtime rollout — 2026-11-27

- Reviewed production integration: #355; checkout credential isolation: #356.
- Trusted runtime seed workflow run: 45968004388; build, independent verification and registry publication successful.
- Activated dependency image: `ghcr.io/dusandvorak-byte/ai-advocate-evidence-lab/pdf-runtime@sha256:a278f6358e9c4a20cf743eb485027747fd9ab74ac4de9c8c43b5d98cc3c985d4`.
- Runtime selection and materialization opt-in were set and read back after merging #356. Previous audit 45968838590 started before activation and used host installs; it failed during a shard dependency install.
- This operational note changes neither evidence nor build scripts, policy, source PDFs or publication authorization. A new push with this changed path is required because the audit uses a path filter; the preceding empty commit did not trigger it.
- Success criteria: exact image use, positive compatible transformation shadow evidence before reuse, independent final audit, and actual elapsed timing. No publication authorization is granted by this note.
