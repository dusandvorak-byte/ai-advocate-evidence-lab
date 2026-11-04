-- Disposable PostgreSQL CI only. Fails closed on broken constraints/rollback.
\set ON_ERROR_STOP on
INSERT INTO evidence_intake (id,created_by,title,reference,state,version,sha256,object_key,size_bytes)
VALUES ('44444444-4444-4444-8444-444444444444','https://oidc.example.test|editor',
  'DEMO: Phase 4','DEMO-PHASE4','scanning',0,repeat('c',64),
  'quarantine/55555555-5555-4555-8555-555555555555',64);
BEGIN;
INSERT INTO evidence_scan_receipt
(id,intake_id,object_key,object_sha256,receipt_sha256,verdict)
VALUES ('scan-4','44444444-4444-4444-8444-444444444444',
'quarantine/55555555-5555-4555-8555-555555555555',repeat('c',64),repeat('d',64),'clean');
INSERT INTO evidence_outbox(intake_id,event_kind,event_version,payload)
VALUES ('44444444-4444-4444-8444-444444444444','review_state_changed',1,'{"state":"metadata_review"}');
ROLLBACK;
DO $$
BEGIN
 IF (SELECT count(*) FROM evidence_scan_receipt WHERE id='scan-4') <> 0
  OR (SELECT count(*) FROM evidence_outbox
      WHERE intake_id='44444444-4444-4444-8444-444444444444') <> 0
 THEN RAISE EXCEPTION 'Rollback failed for receipt or outbox'; END IF;
END $$;
INSERT INTO evidence_scan_receipt
(id,intake_id,object_key,object_sha256,receipt_sha256,verdict)
VALUES ('scan-4','44444444-4444-4444-8444-444444444444',
'quarantine/55555555-5555-4555-8555-555555555555',repeat('c',64),repeat('d',64),'clean');
DO $$
BEGIN
 BEGIN
  INSERT INTO evidence_scan_receipt
  (id,intake_id,object_key,object_sha256,receipt_sha256,verdict)
  VALUES ('scan-replay','44444444-4444-4444-8444-444444444444',
  'quarantine/55555555-5555-4555-8555-555555555555',repeat('c',64),repeat('e',64),'clean');
  RAISE EXCEPTION 'REPLAY_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF EXISTS (SELECT 1 FROM evidence_scan_receipt WHERE id='scan-replay')
 THEN RAISE EXCEPTION 'Duplicate consumed receipt persisted'; END IF;
END $$;
INSERT INTO evidence_outbox(intake_id,event_kind,event_version,payload)
VALUES ('44444444-4444-4444-8444-444444444444','review_state_changed',1,'{"state":"metadata_review"}');
DO $$
BEGIN
 BEGIN
  INSERT INTO evidence_outbox(intake_id,event_kind,event_version,payload)
  VALUES ('44444444-4444-4444-8444-444444444444','review_state_changed',1,'{}');
  RAISE EXCEPTION 'DUPLICATE_OUTBOX_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT 'PHASE4_PG_REPLAY_ROLLBACK_OUTBOX_OK' AS result;
