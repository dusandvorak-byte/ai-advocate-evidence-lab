-- Phase 5 isolated additive migration for disposable PostgreSQL only.
-- A lease fences stale workers. Side effects remain at-least-once, not exactly-once.
BEGIN;
ALTER TABLE evidence_outbox
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS leased_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS dead_letter_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_class text;
ALTER TABLE evidence_outbox
  ADD CONSTRAINT evidence_outbox_lease_pair CHECK (
    (lease_token IS NULL AND leased_until IS NULL) OR
    (lease_token IS NOT NULL AND leased_until IS NOT NULL)
  );
ALTER TABLE evidence_outbox
  ADD CONSTRAINT evidence_outbox_failure_class CHECK (
    last_failure_class IS NULL OR last_failure_class IN
      ('dispatch_failed','ack_failed','unknown')
  );
CREATE INDEX IF NOT EXISTS evidence_outbox_claim_idx
  ON evidence_outbox(next_attempt_at,id)
  WHERE processed_at IS NULL AND dead_letter_at IS NULL;
-- No grant/RLS changes: deployment is prohibited and requires separate review.
COMMIT;
