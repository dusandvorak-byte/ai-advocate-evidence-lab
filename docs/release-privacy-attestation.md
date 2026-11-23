# Evidence Lab: trusted release and human privacy attestation

## Scope and authority
The workflow `.github/workflows/publish-gh-pages-branch.yml` is preflight-only unless the
**only** change on the immediately preceding `main` commit is
`.release/evidence-lab-publication-authorization.json` and its
`authorized_target_sha` is the exact immediately preceding `main` SHA.

A release must **fail closed** unless all of these are independently verified:

1. The authoritative PDF shard workflow completed successfully for the exact parent SHA; the
   report reconciles the staged content, has zero hard privacy failures and excludes withdrawn ID69.
2. The **entire** `validate-evidence-lab-2.yml` push-to-main workflow completed with success
   on the exact parent SHA, including its **trusted secret-backed** job. A PR-only/static job
   is never sufficient. Cancellation, timeout, skipped job or failure blocks publication.
3. An independent **human** configured as the dedicated privacy reviewer has inspected the
   exact public release and approved the authorization PR **after both audits completed**.
4. That human left a GitHub **APPROVED review**, on the exact authorization PR head commit,
   whose entire review body is the exact string described below. Informal PR comments,
   Codex automated reviews and the author's own signoff do not qualify.
5. All the existing staged SHA, original/public copy, privacy and live-production checks
   continue to apply.

## Administrator setup before release
Configure repository variable `EVIDENCE_LAB_PRIVACY_REVIEWER` to the exact GitHub login of a
designated human reviewer with OWNER/MEMBER/COLLABORATOR rights. Leave unset to prevent all
production release; do not infer this identity or default to the automation bot.

After both **exact parent SHA** workflows finish with success, the designated reviewer must
check the actual audited public release, privacy/redaction evidence, full PDF set, withdrawn
items, text/visual rendering, metadata, embedded objects and any human-review flags.
A machine audit does **not** replace this review. If the reviewer cannot responsibly
attest, they must **not** approve.

On the authorization-only pull request, the reviewer submits an **Approve** review with
the *entire* body set to:

```text
EVIDENCE-LAB PRIVACY APPROVED target=<40-character audited main SHA> audit_run=<trusted PDF shard run ID>
```

This review must be newer than completion of the exact-SHA shard and full trusted workflows
and must be on the authorization PR's current HEAD. The reviewer's latest review must still
be approved; a subsequent dismissal or request for changes blocks publication.

The release workflow independently obtains the associated merged authorization PR and its
reviews through GitHub REST using `GITHUB_TOKEN`. The protected gate fails closed if the
environment is missing, the reviewer is absent, the audit is incomplete, the target SHA
differs or the attestation does not match exactly.

## Deployment and verification
The authorization PR remains Draft until all audits pass and the human completes the
review. Its merge and production promotion require separate operator approval.
On a subsequent approved authorization-only merge, verify the resulting `gh-pages` commit,
GitHub Pages deployment, public PDF HTTP responses and exact SHA-256 matches independently.

If a new `main` commit intervenes, discard the stale authorization candidate and repeat
against the new exact parent SHA. Never bypass the gates by editing the tests or checks.

## Verification evidence
Regression tests are `test/test_release_promotion_gates.py` and cover fail-closed negative
scenarios (wrong SHA, cancelled/failed trusted job, spoofed/old/bot/self-approved privacy
attestation, missing identity). Retain actual audit run IDs and the GitHub APPROVED review
receipt as the authoritative release evidence.

Rollback: revert this workflow-only change on a protected branch after review. No source
PDF, privacy rules or already-live content are modified by these gating changes.
