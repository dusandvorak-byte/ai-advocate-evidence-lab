import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicRegistryEntry,normalizePublicRegistry} from './public-registry-contract.mjs';
const base=Object.freeze({
 id:'DEMO-1',title:'Modelový dokument',institution:'Modelový soud',kind:'Usnesení',
 issuedAt:'2026-10-20',publicStatus:'published',privacyReviewed:true,releaseApproved:true,
 publicUrl:'/documents/demo.pdf',publicSha256:'a'.repeat(64),
 secret:'do-not-copy',originalUrl:'/private/demo.pdf',authorEmail:'private@example.test'
});
test('only an explicitly approved, redacted public export is eligible',()=>{
 const v=validatePublicRegistryEntry(base);
 assert.equal(v.status,'published');
 assert.equal(v.publicUrl,'/documents/demo.pdf');
 assert.equal(v.secret,undefined);
 assert.equal(v.originalUrl,undefined);
 assert.equal(v.authorEmail,undefined);
 assert.ok(Object.isFrozen(v));
});
test('never allow unapproved, private, unverified or mixed-origin records',()=>{
 const changes=[
  {privacyReviewed:false},{releaseApproved:false},{publicStatus:'review'},
  {publicSha256:'unknown'},{publicUrl:'https://example.test/private.pdf'},
  {publicUrl:'//attacker.test/file.pdf'},{publicUrl:'/documents/../private.pdf'},
  {publicUrl:'/documents/%2e%2e/private.pdf'},{publicUrl:'/documents/file.pdf?secret=x'},
  {publicUrl:'/documents/file.pdf#fragment'},{publicUrl:'/documents/private\\file.pdf'},
  {issuedAt:'2026-02-31'},{id:undefined},{kind:'PrivateSource'},
 ];
 for(const patch of changes)
  assert.throws(()=>validatePublicRegistryEntry({...base,...patch}),undefined,JSON.stringify(patch));
});
test('reject duplicate IDs and preserve input immutability',()=>{
 assert.throws(()=>normalizePublicRegistry([base,base]),/Duplicate/);
 assert.deepEqual(normalizePublicRegistry([base]).map(x=>x.id),['DEMO-1']);
 assert.equal(base.secret,'do-not-copy');
});
