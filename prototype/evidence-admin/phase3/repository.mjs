import { randomUUID, createHash } from 'node:crypto';
import { requireRole } from './identity.mjs';
import { advanceReview } from '../backend/review-workflow.mjs';

const sha256 = bytes=>createHash('sha256').update(bytes).digest('hex');
const uuid = x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const syntheticTitle = x=>typeof x==='string' && /^DEMO: [^\r\n]{1,100}$/.test(x);
const syntheticRef = x=>typeof x==='string' && /^DEMO-[A-Z0-9-]{1,40}$/.test(x);

// Db contract: pool.connect() -> client.query(sql, params), client.release().
// Transactions and row locking MUST execute on the SAME client.
export function createIntakeRepository({pool,verifyScanReceipt}) {
  if (!pool || typeof pool.connect !== 'function' || typeof verifyScanReceipt!=='function')
    throw new Error('PostgreSQL adapter and trusted scan verifier required');
  async function inTransaction(work) {
    const c=await pool.connect();
    let began=false;
    try {
      await c.query('BEGIN'); began=true;
      const result=await work(c);
      await c.query('COMMIT'); began=false;
      return result;
    } catch(e) {
      if (began) {
        try { await c.query('ROLLBACK'); } catch { /* preserve the original failure */ }
      }
      throw e;
    } finally { c.release(); }
  }
  async function create({identity,title,reference,objectKey,bytes,id=randomUUID()}) {
    const actor=requireRole(identity,'editor');
    if (!uuid(id)||!syntheticTitle(title)||!syntheticRef(reference)||
        typeof objectKey!=='string'||!/^quarantine\/[0-9a-f-]{36}$/.test(objectKey)||
        !Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>20*1024*1024||
        !bytes.includes(Buffer.from('\n%EVIDENCE-LAB-TEST-ONLY\n')))
      throw new Error('Only synthetic untrusted documents allowed in Phase 3');
    const digest=sha256(bytes);
    await inTransaction(async c=>{
      await c.query(`INSERT INTO evidence_intake
        (id,created_by,title,reference,state,version,sha256,object_key,size_bytes)
        VALUES ($1,$2,$3,$4,'scanning',0,$5,$6,$7)`,
        [id,actor,title,reference,digest,objectKey,bytes.length]);
      await c.query(`INSERT INTO evidence_audit
        (intake_id,event_type,actor,role,before_state,after_state,previous_version,version)
        VALUES ($1,'submit',$2,'editor',NULL,'scanning',NULL,0)`,[id,actor]);
    });
    return {id,state:'scanning',version:0,sha256:digest};
  }
  async function transition({identity,id,action,expectedVersion,scanReceipt,flags={}}) {
    if(!uuid(id)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0)
      throw new Error('Invalid request');
    if(!identity?.actor||!Array.isArray(identity.roles)) throw new Error('Unauthenticated');
    const roleByAction={scan_clean:'scanner',scan_reject:'scanner',
      metadata_accept:'reviewer',privacy_accept:'privacy_reviewer',
      approve:'publisher',reject:null};
    const role=roleByAction[action];
    if (!role && action!=='reject') throw new Error('Unsupported transition');
    const allowed=action==='reject' ? identity.roles.filter(r=>r==='reviewer'||r==='privacy_reviewer'||r==='publisher') : [role];
    if (!allowed.length) throw new Error('Forbidden');
    const actor=requireRole(identity,allowed[0]);
    return inTransaction(async c=>{
      const res=await c.query('SELECT * FROM evidence_intake WHERE id=$1 FOR UPDATE',[id]);
      const row=res.rows?.[0];
      if(!row) throw new Error('Not found');
      if(row.version!==expectedVersion) throw new Error('Stale record version');
      const roleForTransition=action==='reject'
        ? row.state==='metadata_review'?'reviewer':row.state==='privacy_review'?'privacy_reviewer':'publisher'
        :role;
      requireRole(identity,roleForTransition);
      if (action.startsWith('scan_')) {
        if (!scanReceipt?.verified || !(await verifyScanReceipt(scanReceipt)) || scanReceipt.intakeId!==id ||
            scanReceipt.objectSha256!==row.sha256 || !/^[a-f0-9]{64}$/.test(scanReceipt.receiptSha256) ||
            (action==='scan_clean'&&scanReceipt.verdict!=='clean') ||
            (action==='scan_reject'&&scanReceipt.verdict!=='malicious'))
          throw new Error('Trusted scanner receipt required');
      }
      // User input may only provide a boolean decision via an explicit reviewer role;
      // there is no request-controlled actor, role or scanner verdict.
      const safeFlags={};
      if(roleForTransition==='reviewer' && action==='metadata_accept'&&flags.metadata_complete===true)
        safeFlags.metadata_complete=true;
      if(roleForTransition==='privacy_reviewer' && action==='privacy_accept'&&flags.public_copy_reviewed===true)
        safeFlags.public_copy_reviewed=true;
      if(roleForTransition==='publisher' && action==='approve'&&flags.content_approved===true)
        safeFlags.content_approved=true;
      const updated=advanceReview({...row,...safeFlags},{
        action,actor,role:roleForTransition,expectedVersion,
        scanResult:action==='scan_clean'?'clean':action==='scan_reject'?'malicious':undefined});
      const upd=await c.query(`UPDATE evidence_intake SET
        state=$2,version=$3,metadata_complete=$4,public_copy_reviewed=$5,
        content_approved=$6,metadata_reviewer=$7,privacy_reviewer=$8,
        approved_by=$9,scan_receipt_id=$10,updated_at=now()
        WHERE id=$1 AND version=$11`,[id,updated.state,updated.version,
          updated.metadata_complete,updated.public_copy_reviewed,
          updated.content_approved,updated.metadata_reviewer??null,
          updated.privacy_reviewer??null,updated.approved_by??null,
          scanReceipt?.id??row.scan_receipt_id??null,expectedVersion]);
      if(upd.rowCount!==1) throw new Error('Optimistic concurrency conflict');
      await c.query(`INSERT INTO evidence_audit
        (intake_id,event_type,actor,role,before_state,after_state,
         previous_version,version,receipt_sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id,action,actor,roleForTransition,row.state,updated.state,
          expectedVersion,updated.version,scanReceipt?.receiptSha256??null]);
      return {id,state:updated.state,version:updated.version};
    });
  }
  return Object.freeze({create,transition});
}
