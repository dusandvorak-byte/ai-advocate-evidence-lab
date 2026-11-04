import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDurableReview} from './durable-review.mjs';
import {createOutboxWorker,listStaleQuarantine} from './outbox.mjs';

const id=randomUUID(),objectKey='quarantine/'+randomUUID();
const base={id,created_by:'issuer|creator',state:'scanning',version:0,
  object_key:objectKey,sha256:'a'.repeat(64),metadata_complete:false,
  public_copy_reviewed:false,content_approved:false};
const scanner={actor:'issuer|scanner',roles:['scanner']};
function fixture({failAudit=false,failOutbox=false}={}){
 const db={row:structuredClone(base),receipts:[],audit:[],outbox:[],rollbacks:0,commits:0};
 const pool={async connect(){let snapshot;
   return {release(){},async query(sql,args=[]){
    if(sql==='BEGIN'){snapshot=structuredClone(db);return {};}
    if(sql==='COMMIT'){db.commits++;return {};}
    if(sql==='ROLLBACK'){Object.assign(db,snapshot);db.rollbacks++;return {};}
    if(sql.startsWith('SELECT * FROM evidence_intake'))return {rows:[structuredClone(db.row)]};
    if(sql.startsWith('INSERT INTO evidence_scan_receipt')){
      if(db.receipts.find(r=>r[0]===args[0] || r[1]===args[1] || r[4]===args[4]))
        throw new Error('unique_violation');
      db.receipts.push(args);return {rowCount:1};
    }
    if(sql.startsWith('UPDATE evidence_intake')){
      if(db.row.version!==args[10])return {rowCount:0};
      Object.assign(db.row,{state:args[1],version:args[2]});return {rowCount:1};
    }
    if(sql.startsWith('INSERT INTO evidence_audit')){
      if(failAudit)throw new Error('audit unavailable');
      db.audit.push(args);return {rowCount:1};
    }
    if(sql.startsWith('INSERT INTO evidence_outbox')){
      if(failOutbox)throw new Error('outbox unavailable');
      db.outbox.push({id:1,intake_id:args[0],event_kind:'review_state_changed',
       event_version:args[1],payload:JSON.parse(args[2]),processed_at:null});return {rowCount:1};
    }
    if(sql.startsWith('SELECT id,intake_id,event_kind'))return {rows:db.outbox.filter(x=>x.processed_at===null).slice(0,1)};
    if(sql.startsWith('UPDATE evidence_outbox')){
      const event=db.outbox.find(x=>x.id===args[0]);if(!event||event.processed_at)return {rowCount:0};
      event.processed_at=new Date().toISOString();return {rowCount:1};
    }
    throw new Error('Unknown SQL '+sql);
   }};
 }};
 return {db,pool};
}
const receipt={id:'receipt-1',verified:true,intakeId:id,objectKey,
  objectSha256:'a'.repeat(64),receiptSha256:'b'.repeat(64),verdict:'clean'};
test('atomic scan transition persists consumed receipt, state, audit and outbox',async()=>{
 const {db,pool}=fixture();
 const review=createDurableReview({pool,verifyScanReceipt:async()=>true});
 assert.equal((await review.transition({identity:scanner,id,action:'scan_clean',
  expectedVersion:0,scanReceipt:receipt})).state,'metadata_review');
 assert.equal(db.row.version,1);assert.equal(db.receipts.length,1);
 assert.equal(db.audit.length,1);assert.equal(db.outbox.length,1);
 assert.equal(db.commits,1);
 await assert.rejects(review.transition({identity:scanner,id,action:'scan_clean',
  expectedVersion:0,scanReceipt:receipt}),/Stale/);
});
test('untrusted or cross-object scan receipts never change database',async()=>{
 const {db,pool}=fixture();
 const review=createDurableReview({pool,verifyScanReceipt:async()=>true});
 await assert.rejects(review.transition({identity:scanner,id,action:'scan_clean',
   expectedVersion:0,scanReceipt:{...receipt,objectKey:'quarantine/'+randomUUID()}}),/Untrusted/);
 assert.equal(db.row.version,0);assert.equal(db.receipts.length,0);
 const denied=createDurableReview({pool,verifyScanReceipt:async()=>false});
 await assert.rejects(denied.transition({identity:scanner,id,action:'scan_clean',
   expectedVersion:0,scanReceipt:receipt}),/Untrusted/);
 assert.equal(db.receipts.length,0);
});
test('audit or outbox failure rolls back receipt consumption and state change',async()=>{
 for(const opts of [{failAudit:true},{failOutbox:true}]){
  const {db,pool}=fixture(opts);
  const review=createDurableReview({pool,verifyScanReceipt:async()=>true});
  await assert.rejects(review.transition({identity:scanner,id,action:'scan_clean',
   expectedVersion:0,scanReceipt:receipt}),/unavailable/);
  assert.equal(db.row.version,0);assert.equal(db.receipts.length,0);
  assert.equal(db.audit.length,0);assert.equal(db.outbox.length,0);
  assert.equal(db.rollbacks,1);
 }
});
test('outbox drain is idempotent on committed events, retries on failure',async()=>{
 const {db,pool}=fixture();
 const review=createDurableReview({pool,verifyScanReceipt:async()=>true});
 await review.transition({identity:scanner,id,action:'scan_clean',expectedVersion:0,scanReceipt:receipt});
 let calls=0;
 const bad=createOutboxWorker({pool,dispatch:async()=>{calls++;throw Error('consumer down');}});
 await assert.rejects(bad.processOne(),/consumer down/);
 assert.equal(db.outbox[0].processed_at,null);
 const good=createOutboxWorker({pool,dispatch:async event=>{calls++;assert.equal(event.event_version,1);}});
 assert.equal((await good.processOne()).processed,true);
 assert.equal((await good.processOne()).processed,false);
 assert.equal(calls,2);
});
test('reconciliation is read-only and validates limits',async()=>{
 let query;
 const pool={query:async(sql,args)=>(query={sql,args},{rows:[]})};
 assert.deepEqual(await listStaleQuarantine({pool,olderThanMinutes:30,limit:10}),[]);
 assert.deepEqual(query.args,[30,10]);assert.match(query.sql,/state='scanning'/);
 await assert.rejects(listStaleQuarantine({pool,olderThanMinutes:0}),/Invalid/);
});
