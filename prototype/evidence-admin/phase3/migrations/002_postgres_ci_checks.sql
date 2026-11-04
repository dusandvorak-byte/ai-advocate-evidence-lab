-- Disposable PostgreSQL CI test only. Uses no legal material or live credentials.
BEGIN;
INSERT INTO evidence_intake
  (id,created_by,title,reference,state,version,sha256,object_key,size_bytes)
VALUES ('11111111-1111-4111-8111-111111111111',
  'https://oidc.example.test|editor','DEMO: Transaction probe','DEMO-PG',
  'scanning',0,repeat('a',64),'quarantine/22222222-2222-4222-8222-222222222222',40);
INSERT INTO evidence_audit
 (intake_id,event_type,actor,role,before_state,after_state,previous_version,version)
VALUES ('11111111-1111-4111-8111-111111111111',
 'submit','https://oidc.example.test|editor','editor',NULL,'scanning',NULL,0);
SAVEPOINT before_transition;
UPDATE evidence_intake SET state='metadata_review',version=1
 WHERE id='11111111-1111-4111-8111-111111111111' AND version=0;
INSERT INTO evidence_audit
 (intake_id,event_type,actor,role,before_state,after_state,previous_version,version)
VALUES ('11111111-1111-4111-8111-111111111111',
 'scan_clean','https://oidc.example.test|scanner','scanner','scanning','metadata_review',0,1);
ROLLBACK TO SAVEPOINT before_transition;
DO $$
BEGIN
  IF (SELECT state FROM evidence_intake WHERE id='11111111-1111-4111-8111-111111111111') <> 'scanning'
      OR (SELECT version FROM evidence_intake WHERE id='11111111-1111-4111-8111-111111111111') <> 0
      OR (SELECT count(*) FROM evidence_audit WHERE intake_id='11111111-1111-4111-8111-111111111111') <> 1
  THEN RAISE EXCEPTION 'PostgreSQL transaction rollback broken'; END IF;
END $$;
COMMIT;
-- CHECK constraint must reject invalid quarantine keys; test within handled subtransaction.
DO $$
BEGIN
  BEGIN
    INSERT INTO evidence_intake
      (id,created_by,title,reference,state,version,sha256,object_key,size_bytes)
    VALUES ('33333333-3333-4333-8333-333333333333','demo','DEMO: Bad','DEMO-BAD',
      'scanning',0,repeat('b',64),'public/document.pdf',40);
    RAISE EXCEPTION 'Unsafe public object key was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
-- Append-only audit trigger rejects mutations even when connected as table owner.
DO $$
BEGIN
  BEGIN
    UPDATE evidence_audit SET event_type='tampered'
      WHERE intake_id='11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'Audit UPDATE unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF EXISTS (SELECT 1 FROM evidence_audit WHERE event_type='tampered')
    THEN RAISE EXCEPTION 'Audit row was changed despite trigger'; END IF;
  END;
END $$;
SELECT 'PHASE3_POSTGRES_ROLLBACK_AUDIT_AND_CONSTRAINTS_OK' AS result;
