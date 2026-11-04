// Phase 4 outbox boundary: drain only through an injected synthetic dispatcher.
// At-least-once delivery; consumers MUST dedupe by event ID, never publish PDFs.
const kinds = new Set(['quarantine_reconciliation','scan_requested','review_state_changed']);
export function createOutboxWorker({pool,dispatch}) {
  if(typeof pool?.connect!=='function'||typeof dispatch!=='function')
    throw new Error('Outbox worker requires database and injected dispatcher');
  async function processOne() {
    const c=await pool.connect(); let begun=false;
    try {
      await c.query('BEGIN');begun=true;
      const {rows}=await c.query(`SELECT id,intake_id,event_kind,event_version,payload
        FROM evidence_outbox WHERE processed_at IS NULL
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
      const event=rows?.[0];
      if(!event){await c.query('COMMIT');begun=false;return {processed:false};}
      if(!kinds.has(event.event_kind) || !Number.isSafeInteger(Number(event.id)))
        throw new Error('Unexpected outbox message');
      // This callback is trusted, synthetic, and idempotent by event.id.
      // Real external sends must use a separate lease/ack design before deployment.
      await dispatch(Object.freeze({...event}));
      const result=await c.query(`UPDATE evidence_outbox
        SET processed_at=now(),attempt_count=attempt_count+1
        WHERE id=$1 AND processed_at IS NULL`,[event.id]);
      if(result.rowCount!==1)throw new Error('Outbox acknowledgement race');
      await c.query('COMMIT');begun=false;
      return {processed:true,id:event.id};
    } catch(e) {
      if(begun) {
        try{await c.query('ROLLBACK');}catch(rollbackError){
          throw new AggregateError([e,rollbackError],'Outbox rollback failed');
        }
      }
      throw e;
    } finally {c.release();}
  }
  return Object.freeze({processOne});
}
// Explicit reconciliation report only; no automatic deletion or upload.
export async function listStaleQuarantine({pool,olderThanMinutes=60,limit=50}) {
  if(typeof pool?.query!=='function'||!Number.isSafeInteger(olderThanMinutes)||
     olderThanMinutes<5||olderThanMinutes>1440||
     !Number.isSafeInteger(limit)||limit<1||limit>100)
    throw new Error('Invalid reconciliation query');
  const result=await pool.query(`SELECT id,object_key,sha256,created_at
    FROM evidence_intake WHERE state='scanning'
      AND created_at < now() - ($1::integer * interval '1 minute')
    ORDER BY created_at LIMIT $2`,[olderThanMinutes,limit]);
  return (result.rows||[]).map(r=>Object.freeze({...r}));
}
