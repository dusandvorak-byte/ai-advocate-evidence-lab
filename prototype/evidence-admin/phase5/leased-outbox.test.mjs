import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeasedOutbox} from './leased-outbox.mjs';
const uuid='11111111-1111-4111-8111-111111111111';
function fakePool(events=[{id:1,intake_id:uuid,event_kind:'review_state_changed',
  event_version:3,payload:{state:'privacy_review'},attempt_count:0}]) {
  let now=1000;const rows=events.map(e=>({...e,processed_at:null,
    dead_letter_at:null,lease_token:null,leased_until:null,next_attempt_at:0}));
  let failAck=false;
  const pool={async query(sql,args=[]) {
    if(sql.startsWith('UPDATE evidence_outbox SET dead_letter_at=now()')) {
      let count=0;
      for(const e of rows){
        if(!e.processed_at&&!e.dead_letter_at&&e.attempt_count>=args[0]&&
          (e.leased_until===null||e.leased_until<=now)){
          e.dead_letter_at=now;e.lease_token=null;e.leased_until=null;count++;
        }
      }
      return {rowCount:count};
    }
    if(sql.startsWith('WITH candidate')) {
      const e=rows.find(e=>!e.processed_at&&!e.dead_letter_at&&
        e.next_attempt_at<=now&&e.attempt_count<args[2]&&(e.leased_until===null||e.leased_until<=now));
      if(!e)return {rows:[]};
      e.lease_token=args[0];e.leased_until=now+args[1];e.attempt_count++;
      return {rows:[structuredClone(e)]};
    }
    if(sql.includes('SET processed_at=now()')) {
      if(failAck)throw Error('database ack unavailable');
      const e=rows.find(e=>e.id===args[0]&&e.lease_token===args[1]&&
        e.leased_until>now&&!e.processed_at&&!e.dead_letter_at);
      if(!e)return {rowCount:0};
      e.processed_at=now;e.lease_token=null;e.leased_until=null;return {rowCount:1};
    }
    if(sql.includes('last_failure_class=\'dispatch_failed\'')) {
      const e=rows.find(e=>e.id===args[0]&&e.lease_token===args[1]&&
        e.leased_until>now&&!e.processed_at);
      if(!e)return {rowCount:0};
      e.lease_token=null;e.leased_until=null;e.next_attempt_at=now+args[2];
      if(args[3])e.dead_letter_at=now;
      return {rowCount:1};
    }
    throw Error('Unknown query '+sql);
  }};
  return {pool,rows,advance:s=>now+=s,setFailAck:x=>failAck=x};
}
test('claim commits before callback; one event is dispatched and acknowledged',async()=>{
 const {pool,rows}=fakePool();let called=0;
 const w=createLeasedOutbox({pool,dispatch:async e=>{
   called++;assert.equal(e.idempotencyKey,'evidence-outbox:1');
   assert.equal(e.state,'privacy_review');assert.equal(e.url,undefined);
 }});
 assert.equal((await w.processOne()).processed,true);
 assert.equal((await w.processOne()).processed,false);
 assert.equal(called,1);assert.ok(rows[0].processed_at);
});
test('two workers cannot claim one active lease, stale ack fenced off',async()=>{
 const {pool,advance}=fakePool();
 const w=createLeasedOutbox({pool,dispatch:async()=>{}});
 const first=await w.claim();assert.equal((await w.claim()),null);
 advance(31);const second=await w.claim();
 assert.notEqual(first.lease_token,second.lease_token);
 await assert.rejects(w.ack(first.id,first.lease_token),/Lease expired/);
 await w.ack(second.id,second.lease_token);
});
test('retry backs off then dead-letters after bounded attempts',async()=>{
 const {pool,rows,advance}=fakePool();let count=0;
 const w=createLeasedOutbox({pool,maxAttempts:2,backoffSeconds:10,dispatch:async()=>{
   count++;throw Error('synthetic dispatcher unavailable');
 }});
 assert.deepEqual(await w.processOne(),{processed:false,retry:true,deadLetter:false,leaseLost:false});
 assert.equal((await w.processOne()).processed,false);
 advance(11);
 assert.deepEqual(await w.processOne(),{processed:false,retry:false,deadLetter:true,leaseLost:false});
 advance(1000);
 assert.equal((await w.processOne()).processed,false);
 assert.equal(count,2);assert.ok(rows[0].dead_letter_at!==null);
});
test('successful side-effect followed by failed ack may repeat only with same key',async()=>{
 const {pool,setFailAck,advance}=fakePool();
 const keys=[];const w=createLeasedOutbox({pool,leaseSeconds:5,
  dispatch:async msg=>{keys.push(msg.idempotencyKey);}});
 setFailAck(true);await assert.rejects(w.processOne(),/database ack unavailable/);
 advance(6);setFailAck(false);
 assert.equal((await w.processOne()).processed,true);
 assert.deepEqual(keys,['evidence-outbox:1','evidence-outbox:1']);
});
test('invalid event never reaches dispatcher and enters dead letter',async()=>{
 const {pool,rows}=fakePool([{id:1,intake_id:uuid,event_kind:'scan_requested',
   event_version:1,payload:{state:'scanning'},attempt_count:0}]);
 let called=false;
 const w=createLeasedOutbox({pool,dispatch:async()=>{called=true;}});
 await assert.rejects(w.processOne(),/Invalid synthetic outbox event/);
 assert.equal(called,false);assert.ok(rows[0].dead_letter_at!==null);
});

test('crashed worker with expired final lease is dead-lettered without a NACK',async()=>{
 const {pool,rows,advance}=fakePool();
 const w=createLeasedOutbox({pool,leaseSeconds:5,maxAttempts:1,dispatch:async()=>{}});
 const claimed=await w.claim();assert.ok(claimed);
 advance(6);
 assert.equal(await w.claim(),null);
 assert.ok(rows[0].dead_letter_at!==null);
 await assert.rejects(w.ack(claimed.id,claimed.lease_token),/Lease expired/);
});
