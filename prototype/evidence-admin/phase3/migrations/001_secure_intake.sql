-- Phase 3 foundation; migration only. No automatic execution or connection settings.
BEGIN;
CREATE TABLE IF NOT EXISTS evidence_intake (
  id uuid PRIMARY KEY,
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 3 AND 512),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 80),
  state text NOT NULL DEFAULT 'scanning' CHECK (state IN
    ('scanning','quarantined','metadata_review','privacy_review','ready_for_approval','approved','rejected')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  object_key text NOT NULL UNIQUE CHECK (object_key LIKE 'quarantine/%'),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 16 AND 20971520),
  metadata_complete boolean NOT NULL DEFAULT false,
  public_copy_reviewed boolean NOT NULL DEFAULT false,
  content_approved boolean NOT NULL DEFAULT false,
  metadata_reviewer text,
  privacy_reviewer text,
  approved_by text,
  scan_receipt_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evidence_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intake_id uuid NOT NULL REFERENCES evidence_intake(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor text NOT NULL,
  role text NOT NULL,
  before_state text,
  after_state text NOT NULL,
  previous_version integer,
  version integer NOT NULL CHECK (version >= 0),
  receipt_sha256 text CHECK (receipt_sha256 IS NULL OR receipt_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(intake_id,version)
);
-- Append-only audit: INSERT permitted, UPDATE and DELETE always forbidden, including owner.
CREATE OR REPLACE FUNCTION evidence_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Evidence audit is append-only'; END; $$;
DROP TRIGGER IF EXISTS evidence_audit_no_mutation ON evidence_audit;
CREATE TRIGGER evidence_audit_no_mutation BEFORE UPDATE OR DELETE ON evidence_audit
FOR EACH ROW EXECUTE FUNCTION evidence_audit_immutable();
-- Roles, network isolation, RLS/privileges and backup policy are a deployment gate, not assumed.
COMMIT;
