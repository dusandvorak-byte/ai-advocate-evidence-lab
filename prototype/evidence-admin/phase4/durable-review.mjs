// Phase 4: atomic consumption of independently verified scanner receipts, and
// durable review events. This wraps the Phase 3 repository without modifying it.
// Do not wire to HTTP or real files; injected pg-like pool only.
import { requireRole } from '../phase3/identity.mjs';
import { advanceReview } from '../../backend/review-workflow.mjs';

const uuid = s => typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const sha = s => typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
const allowedActions = Object.freeze({
  scan_clean:'scanner',scan_reject:'scanner',metadata_accept:'reviewer',
  privacy_accept:'privacy_reviewer',approve:'publisher'
});
export function createDurableReview({pool,verifyScanReceipt}) {
  if(typeof pool?.connect!=='function'||typeof verifyScanReceipt!=='function')
    throw new Error('Explicit PG pool and independent receipt verifier required');
  async function transition({identity,id,action,expectedVersion,scanReceipt,flags={}}) {
    if(!uuid(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion<0 ||
       !Object.hasOwn(allowedActions,action) || !flags || typeof flags!=='object' ||
       Array.isArray(flags)) throw new Error('Invalid review operation');
    const role=allowedActions[action];
    const actor=requireRole(identity,role);
    const client=await pool.connect(); let started=false;
    try {
      await client.query('BEGIN'); started=true;
      const result=await client.query('SELECT * FROM evidence_intake WHERE id=$1 FOR UPDATE',[id]);
      const row=result.rows?.[0];
      if(!row) throw new Error('Not found');
      if(row.version!==expectedVersion) throw new Error('Stale record version');
      if(action.startsWith('scan_')) {
        if(!scanReceipt || !scanReceipt.verified || !(await verifyScanReceipt(scanReceipt)) ||
           scanReceipt.intakeId!==id || scanReceipt.objectKey!==row.object_key ||
           scanReceipt.objectSha256!==row.sha256 ||
           !sha(scanReceipt.receiptSha256) || typeof scanReceipt.id!=='string' ||
           !scanReceipt.id || scanReceipt.id.length>160 ||
           scanReceipt.verdict!==(action==='scan_clean'?'clean':'malicious'))
          throw new Error('Untrusted scanner receipt');
        // DB primary/unique keys enforce single-use across workers AND documents.
        await client.query(`INSERT INTO evidence_scan_receipt
          (id,intake_id,object_key,object_sha256,receipt_sha256,verdict)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [scanReceipt.id,id,row.object_key,row.sha256,
            scanReceipt.receiptSha256,scanReceipt.verdict]);
      } else if(scanReceipt!==undefined) throw new Error('Scanner receipt only valid for scan transitions');
      const accepted={...row};
      if(action==='metadata_accept'&&flags.metadata_complete===true) accepted.metadata_complete=true;
      if(action==='privacy_accept'&&flags.public_copy_reviewed===true) accepted.public_copy_reviewed=true;
      if(action==='approve'&&flags.content_approved===true) accepted.content_approved=true;
      const next=advanceReview(accepted,{action,actor,role,expectedVersion,
        scanResult:action==='scan_clean'?'clean':action==='scan_reject'?'malicious':undefined});
      const update=await client.query(`UPDATE evidence_intake SET
        state=$2,version=$3,metadata_complete=$4,public_copy_reviewed=$5,
        content_approved=$6,metadata_reviewer=$7,privacy_reviewer=$8,
        approved_by=$9,scan_receipt_id=$10,updated_at=now()
        WHERE id=$1 AND version=$11`,
        [id,next.state,next.version,next.metadata_complete,next.public_copy_reviewed,
          next.content_approved,next.metadata_reviewer??null,next.privacy_reviewer??null,
          next.approved_by??null,scanReceipt?.id??row.scan_receipt_id??null,expectedVersion]);
      if(update.rowCount!==1) throw new Error('Concurrent version update');
      await client.query(`INSERT INTO evidence_audit
        (intake_id,event_type,actor,role,before_state,after_state,previous_version,version,receipt_sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id,action,actor,role,row.state,next.state,expectedVersion,
          next.version,scanReceipt?.receiptSha256??null]);
      // No actual publication event is generated. Outbox records a review status only.
      await client.query(`INSERT INTO evidence_outbox (intake_id,event_kind,event_version,payload)
        VALUES ($1,'review_state_changed',$2,$3::jsonb)`,
        [id,next.version,JSON.stringify({state:next.state})]);
      await client.query('COMMIT');started=false;
      return Object.freeze({id,state:next.state,version:next.version});
    } catch(error) {
      if(started) {
        try {await client.query('ROLLBACK');} catch(rollbackError) {
          throw new AggregateError([error,rollbackError],'Transaction rollback failed');
        }
      }
      throw error;
    } finally {client.release();}
  }
  return Object.freeze({transition});
}
