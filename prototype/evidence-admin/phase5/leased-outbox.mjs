import {randomUUID} from 'node:crypto';

// Lease is committed BEFORE dispatch. Dispatch is at-least-once; consumer
// deduplication by durable event ID is REQUIRED. Never treat this as exactly-once.
const validEvent = e => e && Number.isSafeInteger(Number(e.id)) &&
  Number(e.id)>0 && e.event_kind==='review_state_changed' &&
  Number.isSafeInteger(Number(e.event_version)) &&
  typeof e.payload==='object' && e.payload!==null &&
  typeof e.payload.state==='string' &&
  ['scanning','quarantined','metadata_review','privacy_review',
    'ready_for_approval','approved','rejected'].includes(e.payload.state);
export function createLeasedOutbox({pool,dispatch,leaseSeconds=30,maxAttempts=5,
  backoffSeconds=10}={}) {
  if(typeof pool?.query!=='function'||typeof dispatch!=='function' ||
     !Number.isSafeInteger(leaseSeconds)||leaseSeconds<5||leaseSeconds>300||
     !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>20||
     !Number.isSafeInteger(backoffSeconds)||backoffSeconds<1||backoffSeconds>300)
    throw new Error('Explicit synthetic outbox dependencies and bounded policy required');

  async function claim() {
    const token=randomUUID();
    // One atomic statement: SKIP LOCKED avoids worker contention; expired
    // leases can be reclaimed; attempt count increments with the claim.
    const result=await pool.query(`WITH candidate AS (
      SELECT id FROM evidence_outbox
      WHERE processed_at IS NULL AND dead_letter_at IS NULL
        AND next_attempt_at<=now()
        AND (leased_until IS NULL OR leased_until<=now())
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE evidence_outbox o
      SET lease_token=$1::uuid,
          leased_until=now()+($2::integer * interval '1 second'),
          attempt_count=o.attempt_count+1
      FROM candidate WHERE o.id=candidate.id
      RETURNING o.id,o.intake_id,o.event_kind,o.event_version,o.payload,
        o.attempt_count,o.lease_token`,[token,leaseSeconds]);
    return result.rows?.[0]??null;
  }
  async function ack(id,token) {
    const result=await pool.query(`UPDATE evidence_outbox
       SET processed_at=now(),lease_token=NULL,leased_until=NULL,last_failure_class=NULL
       WHERE id=$1 AND lease_token=$2::uuid AND leased_until>now()
         AND processed_at IS NULL AND dead_letter_at IS NULL`,[id,token]);
    if(result.rowCount!==1) throw new Error('Lease expired or ownership changed before acknowledgement');
  }
  async function nack(id,token,attempt) {
    const exhausted=attempt>=maxAttempts;
    const delay=Math.min(3600,backoffSeconds*2**Math.max(0,attempt-1));
    const result=await pool.query(`UPDATE evidence_outbox
      SET lease_token=NULL,leased_until=NULL,
          next_attempt_at=now()+($3::integer * interval '1 second'),
          dead_letter_at=CASE WHEN $4::boolean THEN now() ELSE NULL END,
          last_failure_class='dispatch_failed'
      WHERE id=$1 AND lease_token=$2::uuid AND leased_until>now()
        AND processed_at IS NULL`,[id,token,delay,exhausted]);
    return {recorded:result.rowCount===1,deadLetter:exhausted&&result.rowCount===1};
  }
  async function processOne() {
    const event=await claim();
    if(!event) return {processed:false};
    const token=event.lease_token;
    if(!validEvent(event)) {
      await nack(event.id,token,maxAttempts);
      throw new Error('Invalid synthetic outbox event; quarantined');
    }
    // API shape is deliberately narrow; no bytes, URLs, filesystem paths or
    // personal data are dispatched. Sender cannot select a publication action.
    const notification=Object.freeze({
      id:String(event.id),intakeId:event.intake_id,
      state:event.payload.state,version:Number(event.event_version),
      idempotencyKey:'evidence-outbox:'+String(event.id)
    });
    try {
      await dispatch(notification);
    } catch(err) {
      const status=await nack(event.id,token,Number(event.attempt_count));
      return {processed:false,retry:status.recorded&&!status.deadLetter,
        deadLetter:status.deadLetter,leaseLost:!status.recorded};
    }
    await ack(event.id,token);
    return {processed:true,id:String(event.id)};
  }
  return Object.freeze({processOne,claim,ack,nack});
}
