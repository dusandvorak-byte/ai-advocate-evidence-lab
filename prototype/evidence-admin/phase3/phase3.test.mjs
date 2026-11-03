import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { authenticateOidc, requireRole } from './identity.mjs';
import { createPrivateQuarantine, createScannerBoundary, createSyntheticIntakeService } from './quarantine.mjs';
import { createIntakeRepository } from './repository.mjs';

const now=1800000000, issuer='https://oidc.example.test', audience='evidence-admin';
const identity=(who,roles)=>({actor:issuer+'|'+who,roles});
const claims={iss:issuer,sub:'editor',aud:audience,iat:now-10,exp:now+300,amr:['pwd','mfa']};
const document=Buffer.from('%PDF-1.4\n%EVIDENCE-LAB-TEST-ONLY\n1 0 obj\n%%EOF\n');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const getIdentity=(overrides={})=>authenticateOidc({
  authorization:'Bearer synthetic-only-token',
  verifyJwt:async()=>({...claims,...overrides}),
  lookupRoles:async()=>['editor'],issuer,audience,nowSeconds:now
});
function memoryPg() {
  const db={row:null,events:[],commits:0,rollbacks:0};
  const pool={
    async connect() {
      let snapshot=null;
      return {
        release(){},
        async query(sql,params=[]) {
          if(sql==='BEGIN'){snapshot=structuredClone({row:db.row,events:db.events});return {rowCount:0};}
          if(sql==='COMMIT'){db.commits++;return {rowCount:0};}
          if(sql==='ROLLBACK'){db.rollbacks++;db.row=snapshot.row;db.events=snapshot.events;return {rowCount:0};}
          if(sql.startsWith('INSERT INTO evidence_intake')) {
            if(db.row)throw Error('duplicate');
            db.row={id:params[0],created_by:params[1],title:params[2],reference:params[3],
              state:'scanning',version:0,sha256:params[4],object_key:params[5],size_bytes:params[6],
              metadata_complete:false,public_copy_reviewed:false,content_approved:false,
              metadata_reviewer:null,privacy_reviewer:null,approved_by:null,scan_receipt_id:null};
            return {rowCount:1};
          }
          if(sql.startsWith('SELECT * FROM evidence_intake'))return {rows:db.row?.id===params[0]?[structuredClone(db.row)]:[]};
          if(sql.startsWith('UPDATE evidence_intake')) {
            if(!db.row||db.row.id!==params[0]||db.row.version!==params[10])return {rowCount:0};
            Object.assign(db.row,{state:params[1],version:params[2],metadata_complete:params[3],
              public_copy_reviewed:params[4],content_approved:params[5],metadata_reviewer:params[6],
              privacy_reviewer:params[7],approved_by:params[8],scan_receipt_id:params[9]});
            return {rowCount:1};
          }
          if(sql.startsWith('INSERT INTO evidence_audit')) {
            db.events.push(params);return {rowCount:1};
          }
          throw new Error('Unexpected SQL '+sql);
        }
      };
    }
  };
  return {pool,db};
}
test('OIDC identity requires external verification, MFA, exact issuer, audience, expiry and trusted RBAC',async()=>{
  assert.deepEqual((await getIdentity()).roles,['editor']);
  await assert.rejects(getIdentity({amr:['pwd'],acr:'low'}),/MFA/);
  await assert.rejects(getIdentity({iss:'https://evil.test'}),/Invalid verified/);
  await assert.rejects(getIdentity({aud:'wrong'}),/Invalid verified/);
  await assert.rejects(getIdentity({exp:now-1}),/Invalid verified/);
  await assert.rejects(authenticateOidc({authorization:'Bearer token',verifyJwt:async()=>claims,
    lookupRoles:async()=>['publisher','admin'],issuer,audience,nowSeconds:now}),/role assignment/);
  assert.throws(()=>requireRole(identity('editor',['viewer']),'publisher'),/Forbidden/);
});
test('private synthetic PDF uploads request KMS encryption and no public ACL',async()=>{
  let sent;
  const storage=createPrivateQuarantine({bucket:'private-test',kmsKeyRef:'synthetic-key',
    client:{putPrivateObject:async obj=>(sent=obj,{accepted:true}),deletePrivateObject:async()=>{}}});
  const receipt=await storage.putSynthetic(document);
  assert.equal(sent.acl,'private');
  assert.equal(sent.sse,'aws:kms');
  assert.equal(sent.kmsKeyRef,'synthetic-key');
  assert.equal(sent.metadata.sha256,digest(document));
  assert.match(receipt.key,/^quarantine\//);
  await assert.rejects(storage.putSynthetic(Buffer.from('%PDF-1.4\nreal legal document\n%%EOF\n')),/Synthetic PDF required/);
});
test('scanner receipt must be validated externally and bound to object digest',async()=>{
  const id=randomUUID(), objectKey='quarantine/'+randomUUID(), sha256=digest(document);
  const good={id:'scan-1',intakeId:id,objectKey,objectSha256:sha256,verdict:'clean',receiptSha256:'a'.repeat(64)};
  const boundary=createScannerBoundary({scanner:{scanPrivateObject:async()=>good},verifyReceipt:async r=>r===good});
  assert.equal((await boundary.inspect({intakeId:id,objectKey,sha256})).verdict,'clean');
  const bad=createScannerBoundary({scanner:{scanPrivateObject:async()=>good},verifyReceipt:async()=>false});
  await assert.rejects(bad.inspect({intakeId:id,objectKey,sha256}),/Untrusted/);
});
test('transactional review enforces 4-person separation, CAS versions and audit',async()=>{
  const {pool,db}=memoryPg();
  const repo=createIntakeRepository({pool,verifyScanReceipt:async r=>r.id==='trusted-scan'});
  const editor=identity('editor',['editor']), scanner=identity('scanner',['scanner']);
  const reviewer=identity('reviewer',['reviewer']), privacy=identity('privacy',['privacy_reviewer']);
  const publisher=identity('publisher',['publisher']);
  const id=randomUUID(), objectKey='quarantine/'+randomUUID();
  await repo.create({identity:editor,title:'DEMO: Trial',reference:'DEMO-X',objectKey,bytes:document,id});
  assert.equal(db.row.version,0);
  const receipt={verified:true,id:'trusted-scan',intakeId:id,objectSha256:digest(document),
    receiptSha256:'a'.repeat(64),verdict:'clean',objectKey};
  await assert.rejects(repo.transition({identity:scanner,id,action:'scan_clean',expectedVersion:0,
    scanReceipt:{...receipt,id:'forged'}}),/Trusted scanner receipt required/);
  assert.equal(db.row.version,0);
  assert.equal((await repo.transition({identity:scanner,id,action:'scan_clean',expectedVersion:0,scanReceipt:receipt})).state,'metadata_review');
  await assert.rejects(repo.transition({identity:reviewer,id,action:'metadata_accept',expectedVersion:0,
    flags:{metadata_complete:true}}),/Stale/);
  await assert.rejects(repo.transition({identity:editor,id,action:'metadata_accept',expectedVersion:1,
    flags:{metadata_complete:true}}),/Forbidden/);
  await repo.transition({identity:reviewer,id,action:'metadata_accept',expectedVersion:1,
    flags:{metadata_complete:true}});
  await assert.rejects(repo.transition({identity:reviewer,id,action:'privacy_accept',expectedVersion:2,
    flags:{public_copy_reviewed:true}}),/Forbidden/);
  await repo.transition({identity:privacy,id,action:'privacy_accept',expectedVersion:2,
    flags:{public_copy_reviewed:true}});
  await repo.transition({identity:publisher,id,action:'approve',expectedVersion:3,
    flags:{content_approved:true}});
  assert.equal(db.row.state,'approved');
  assert.equal(db.row.version,4);
  assert.equal(db.events.length,5);
  assert.equal(db.commits,5);
  assert.equal(db.rollbacks,2); // only failures after BEGIN cause a DB rollback; preflight RBAC failures never enter a transaction
});
test('repository reject/approval cannot be performed by uploader in another role',async()=>{
  const {pool}=memoryPg();const repo=createIntakeRepository({pool,verifyScanReceipt:async()=>true});
  const id=randomUUID(), actor=identity('same',['editor','scanner','reviewer','privacy_reviewer','publisher']);
  const objectKey='quarantine/'+randomUUID();
  await repo.create({identity:actor,title:'DEMO: One',reference:'DEMO-X',objectKey,bytes:document,id});
  await repo.transition({identity:actor,id,action:'scan_clean',expectedVersion:0,scanReceipt:{
    verified:true,id:'receipt',intakeId:id,objectSha256:digest(document),
    receiptSha256:'b'.repeat(64),verdict:'clean',objectKey}});
  await assert.rejects(repo.transition({identity:actor,id,action:'metadata_accept',expectedVersion:1,
    flags:{metadata_complete:true}}),/Creator cannot approve/);
});
test('synthetic intake compensates failed database writes by removing quarantined object',async()=>{
  let removed=0;
  const storage={putSynthetic:async bytes=>({key:'quarantine/'+randomUUID(),sha256:digest(bytes)}),
    removeOrphan:async()=>{removed++;}};
  const service=createSyntheticIntakeService({storage,repository:{create:async()=>{throw Error('db offline');}}});
  await assert.rejects(service.submit({identity:identity('e',['editor']),title:'DEMO: x',reference:'DEMO-X',bytes:document}),/db offline/);
  assert.equal(removed,1);
  const failedService=createSyntheticIntakeService({storage:{...storage,removeOrphan:async()=>{throw Error('storage offline');}},
    repository:{create:async()=>{throw Error('db offline');}}});
  await assert.rejects(failedService.submit({identity:identity('e',['editor']),title:'DEMO: x',reference:'DEMO-X',bytes:document}),/Quarantine reconciliation required/);
});

test('cross-object scan receipt replay and malformed marked bytes fail closed',async()=>{
  const {pool,db}=memoryPg();
  const repo=createIntakeRepository({pool,verifyScanReceipt:async()=>true});
  const id=randomUUID(), objectKey='quarantine/'+randomUUID();
  const editor=identity('creator',['editor']),scanner=identity('scanner',['scanner']);
  await assert.rejects(repo.create({identity:editor,title:'DEMO: no PDF',
    reference:'DEMO-X',objectKey,bytes:Buffer.from('BAD\\n%EVIDENCE-LAB-TEST-ONLY\\n%%EOF')}),/Only synthetic/);
  assert.equal(db.row,null);
  await repo.create({identity:editor,title:'DEMO: OK',reference:'DEMO-X',objectKey,bytes:document,id});
  await assert.rejects(repo.transition({identity:scanner,id,action:'scan_clean',expectedVersion:0,
    scanReceipt:{id:'replay',verified:true,intakeId:id,objectKey:'quarantine/'+randomUUID(),
      objectSha256:digest(document),receiptSha256:'a'.repeat(64),verdict:'clean'}}),/Trusted scanner receipt required/);
  assert.equal(db.row.state,'scanning');
  assert.equal(db.events.length,1);
});
test('invalid identity never writes to storage, invalid returned object key never deleted',async()=>{
  let uploads=0,deletions=0;
  const storage={putSynthetic:async()=>{uploads++;return {key:'quarantine/../../victim',sha256:digest(document)};},
    removeOrphan:async()=>{deletions++;}};
  const svc=createSyntheticIntakeService({storage,repository:{create:async()=>{throw Error('should not write');}}});
  await assert.rejects(svc.submit({identity:identity('viewer',['viewer']),
    title:'DEMO: no',reference:'DEMO-X',bytes:document}),/Synthetic editor intake required/);
  assert.equal(uploads,0);
  await assert.rejects(svc.submit({identity:identity('editor',['editor']),
    title:'DEMO: bad key',reference:'DEMO-X',bytes:document}),/Storage digest mismatch/);
  assert.equal(uploads,1);
  assert.equal(deletions,0);
});
