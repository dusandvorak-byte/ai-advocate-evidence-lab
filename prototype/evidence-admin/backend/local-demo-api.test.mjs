import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLocalDemoApi} from './local-demo-api.mjs';

const editorToken = 'editor-local-demo-token-0123456789abcdef';
const viewerToken = 'viewer-local-demo-token-0123456789abcdef';
const otherToken = 'other-local-demo-token-0123456789abcdef';
const credentials = [
  {token:editorToken, actor:'test-editor', role:'editor'},
  {token:viewerToken, actor:'test-viewer', role:'viewer'},
  {token:otherToken, actor:'other-editor', role:'editor'}
];
const synthetic = Buffer.from('%PDF-1.4\n%EVIDENCE-LAB-TEST-ONLY\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
let server, base;
before(async()=>{
  server=createLocalDemoApi({credentials});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
const request = async (path,{method='GET',token,contentType,body}={})=>{
  const headers = {};
  if(token)headers.authorization='Bearer '+token;
  if(contentType)headers['content-type']=contentType;
  const response=await fetch(base+path,{method,headers,body});
  return {status:response.status,headers:response.headers,body:await response.json()};
};
const createRecord = async()=>{
  const r=await request('/v1/demo/intakes',{method:'POST',token:editorToken,contentType:'application/json',
    body:JSON.stringify({title:'DEMO: Usnesení soudu',reference:'DEMO-2026-11'})});
  assert.equal(r.status,201);
  return r.body.id;
};
test('server requires explicit credentials',()=>assert.throws(()=>createLocalDemoApi({credentials:[]}),/credentials/));
test('health endpoint reveals only demo state',async()=>{
  const x=await request('/healthz');assert.equal(x.status,200);assert.equal(x.body.status,'demo-only');
});
test('unauthenticated intake is rejected',async()=>{
  const x=await request('/v1/demo/intakes',{method:'POST',contentType:'application/json',
    body:JSON.stringify({title:'DEMO: Example',reference:'DEMO-1'})});assert.equal(x.status,401);
});
test('viewer cannot create intake even by spoofing role',async()=>{
  const x=await request('/v1/demo/intakes',{method:'POST',token:viewerToken,contentType:'application/json',
    body:JSON.stringify({title:'DEMO: Example',reference:'DEMO-1',role:'editor'})});assert.equal(x.status,403);
});
test('realistic metadata without DEMO marker is rejected',async()=>{
  const x=await request('/v1/demo/intakes',{method:'POST',token:editorToken,contentType:'application/json',
    body:JSON.stringify({title:'Court order',reference:'2 A 1/2026'})});assert.equal(x.status,422);
});
test('extra fields cannot inject approval or role',async()=>{
  const x=await request('/v1/demo/intakes',{method:'POST',token:editorToken,contentType:'application/json',
    body:JSON.stringify({title:'DEMO: Example',reference:'DEMO-1',state:'approved'})});assert.equal(x.status,422);
});
test('record creation uses server-generated UUID and draft state',async()=>{
  const id=await createRecord();assert.match(id,/^[0-9a-f-]{36}$/);
  const x=await request('/v1/demo/intakes/'+id,{token:editorToken});
  assert.equal(x.status,200);assert.equal(x.body.state,'draft');assert.equal(x.body.version,0);
});
test('record metadata is private to its creator',async()=>{
  const id=await createRecord();const x=await request('/v1/demo/intakes/'+id,{token:otherToken});assert.equal(x.status,403);
});
test('rejects upload of an unmarked PDF without storing',async()=>{
  const id=await createRecord();const x=await request('/v1/demo/intakes/'+id+'/quarantine',{
    method:'POST',token:editorToken,contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nnot demo\n%%EOF\n')});
  assert.equal(x.status,422);
  const r=await request('/v1/demo/intakes/'+id,{token:editorToken});assert.equal(r.body.state,'draft');
});
test('accepts synthetic PDF as unscanned and never publishes',async()=>{
  const id=await createRecord();const x=await request('/v1/demo/intakes/'+id+'/quarantine',{
    method:'POST',token:editorToken,contentType:'application/pdf',body:synthetic});
  assert.equal(x.status,202);assert.equal(x.body.state,'scanning');
  assert.equal(x.body.status,'not_scanned_not_stored');assert.match(x.body.sha256,/^[a-f0-9]{64}$/);
  const check=await request('/v1/demo/intakes/'+id,{token:editorToken});
  assert.equal(check.body.state,'scanning');assert.equal(check.body.version,1);
  assert.equal('file' in check.body,false);
});
test('duplicate upload cannot skip scanner',async()=>{
  const id=await createRecord();
  await request('/v1/demo/intakes/'+id+'/quarantine',{method:'POST',token:editorToken,contentType:'application/pdf',body:synthetic});
  const x=await request('/v1/demo/intakes/'+id+'/quarantine',{method:'POST',token:editorToken,contentType:'application/pdf',body:synthetic});
  assert.equal(x.status,409);
});
test('wrong MIME is rejected',async()=>{
  const id=await createRecord();const x=await request('/v1/demo/intakes/'+id+'/quarantine',{
    method:'POST',token:editorToken,contentType:'application/octet-stream',body:synthetic});
  assert.equal(x.status,415);
});
test('oversize upload is rejected before retention',async()=>{
  const id=await createRecord();const x=await request('/v1/demo/intakes/'+id+'/quarantine',{
    method:'POST',token:editorToken,contentType:'application/pdf',
    body:Buffer.concat([synthetic,Buffer.alloc(129*1024)])});
  assert.equal(x.status,413);
});
test('no mutation path for publication or scanner evidence exists',async()=>{
  const id=await createRecord();
  const x=await request('/v1/demo/intakes/'+id+'/review',{method:'POST',token:editorToken,contentType:'application/json',
    body:'{"action":"approve","role":"publisher"}'});
  assert.equal(x.status,404);
});
test('response disables shared caching and JSON sniffing',async()=>{
  const x=await request('/healthz');assert.equal(x.headers.get('cache-control'),'no-store');
  assert.equal(x.headers.get('x-content-type-options'),'nosniff');
});
