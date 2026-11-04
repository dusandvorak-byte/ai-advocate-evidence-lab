-- Phase 4: durable coordination primitives. Disposable database tests only.
BEGIN;
CREATE TABLE IF NOT EXISTS evidence_scan_receipt (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 160),
  intake_id uuid NOT NULL REFERENCES evidence_intake(id) ON DELETE RESTRICT,
  object_key text NOT NULL CHECK (object_key LIKE 'quarantine/%'),
  object_sha256 text NOT NULL CHECK (object_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_sha256 text NOT NULL UNIQUE CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  verdict text NOT NULL CHECK (verdict IN ('clean','malicious')),
  consumed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(intake_id)
);
CREATE TABLE IF NOT EXISTS evidence_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intake_id uuid NOT NULL REFERENCES evidence_intake(id) ON DELETE RESTRICT,
  event_kind text NOT NULL CHECK(event_kind IN ('quarantine_reconciliation','scan_requested','review_state_changed')),
  event_version integer NOT NULL CHECK(event_version >= 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  UNIQUE(intake_id,event_kind,event_version)
);
-- RLS/least-privilege grants and retention are explicit deploy blockers.
COMMIT;
