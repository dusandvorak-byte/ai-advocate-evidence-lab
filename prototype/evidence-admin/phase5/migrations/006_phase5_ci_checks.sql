-- Phase 5 ephemeral PostgreSQL test; no production data.
\set ON_ERROR_STOP on
INSERT INTO evidence_intake(id,created_by,title,reference,state,version,sha256,object_key,size_bytes)
VALUES ('66666666-6666-4666-8666-666666666666','synthetic|editor',
 'DEMO: lease','DEMO-LEASE','scanning',0,repeat('a',64),
 'quarantine/77777777-7777-4777-8777-777777777777',64);
INSERT INTO evidence_outbox(intake_id,event_kind,event_version,payload)
VALUES('66666666-6666-4666-8666-666666666666','review_state_changed',1,
 '{"state":"metadata_review"}');
-- Atomic SQL claim and CAS acknowledgment with synthetic lease token.
WITH candidate AS (
 SELECT id FROM evidence_outbox
 WHERE processed_at IS NULL AND dead_letter_at IS NULL
 AND next_attempt_at<=now()
 AND (leased_until IS NULL OR leased_until<=now())
 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
) UPDATE evidence_outbox o
 SET lease_token='88888888-8888-4888-8888-888888888888'::uuid,
 leased_until=now()+interval '30 seconds',attempt_count=attempt_count+1
 FROM candidate WHERE o.id=candidate.id
 RETURNING o.id,o.attempt_count;
DO $$
BEGIN
 IF (SELECT count(*) FROM evidence_outbox WHERE
     lease_token='88888888-8888-4888-8888-888888888888' AND attempt_count=1)<>1
 THEN RAISE EXCEPTION 'Claim failed'; END IF;
END $$;
-- A second claim must find no eligible event.
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM evidence_outbox WHERE processed_at IS NULL
 AND dead_letter_at IS NULL AND next_attempt_at<=now()
 AND (leased_until IS NULL OR leased_until<=now());
 IF n<>0 THEN RAISE EXCEPTION 'Active lease is claimable'; END IF;
END $$;
-- Wrong worker's token cannot acknowledge.
UPDATE evidence_outbox SET processed_at=now(),lease_token=NULL,leased_until=NULL
WHERE lease_token='99999999-9999-4999-8999-999999999999'::uuid;
DO $$
BEGIN
 IF (SELECT processed_at FROM evidence_outbox LIMIT 1) IS NOT NULL
 THEN RAISE EXCEPTION 'Stale worker acknowledged'; END IF;
END $$;
UPDATE evidence_outbox SET processed_at=now(),lease_token=NULL,leased_until=NULL
WHERE lease_token='88888888-8888-4888-8888-888888888888'::uuid AND leased_until>now();
DO $$
BEGIN
 IF (SELECT count(*) FROM evidence_outbox WHERE processed_at IS NOT NULL
 AND lease_token IS NULL AND leased_until IS NULL)<>1
 THEN RAISE EXCEPTION 'Acknowledgement failed'; END IF;
END $$;
SELECT 'PHASE5_SQL_LEASE_FENCING_OK' AS result;
