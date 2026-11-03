import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyLivePdf} from './verify-live-pdf.mjs';

const SHA='a'.repeat(40);
const url='https://example.org/sample.pdf', marker='https://example.org/.source-commit';
const makeResponse = data => ({ok:true, text:async()=>data, arrayBuffer:async()=>Buffer.from(data)});
const quiet=()=>{};
async function withFixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),'evidence-pdf-test-'));
  const file=join(dir,'synthetic.pdf');
  await writeFile(file,'%PDF-1.4\nsynthetic\n%%EOF\n');
  try {return await fn(file);} finally {await rm(dir,{recursive:true,force:true});}
}
const good='%PDF-1.4\nsynthetic\n%%EOF\n';

test('delayed PDF propagation eventually matches exact bytes',async()=>withFixture(async file=>{
  let reads=0;
  const fetchImpl=async target=>new URL(target).pathname.endsWith('.pdf') ?
    makeResponse(++reads===1?'old-pdf':good) : makeResponse(SHA);
  const result=await verifyLivePdf({url,expectedFile:file,expectedSourceCommit:SHA,
    markerUrl:marker,attempts:3,delayMs:0,fetchImpl,sleepImpl:async()=>{},log:quiet});
  assert.equal(result.attempt,2);
}));
test('permanent mismatch fails closed and reports both digests',async()=>withFixture(async file=>{
  await assert.rejects(verifyLivePdf({url,expectedFile:file,expectedSourceCommit:SHA,
    attempts:2,delayMs:0,fetchImpl:async()=>makeResponse('wrong-pdf'),
    sleepImpl:async()=>{},log:quiet}),/LIVE_PDF_VERIFICATION_FAILED.*PDF SHA256 mismatch.*expected.*observed/);
}));
test('source marker must match before inspecting PDF',async()=>withFixture(async file=>{
  let markerReads=0,pdfReads=0;
  const fetchImpl=async target=>new URL(target).pathname.endsWith('.pdf')?
    (pdfReads++,makeResponse(good)) : makeResponse(++markerReads===1?'b'.repeat(40):SHA);
  const result=await verifyLivePdf({url,expectedFile:file,expectedSourceCommit:SHA,
    markerUrl:marker,attempts:3,delayMs:0,fetchImpl,sleepImpl:async()=>{},log:quiet});
  assert.equal(result.attempt,2);assert.equal(pdfReads,1);
}));
test('HTTP failures cannot be treated as success',async()=>withFixture(async file=>{
  await assert.rejects(verifyLivePdf({url,expectedFile:file,expectedSourceCommit:SHA,
    attempts:2,delayMs:0,fetchImpl:async()=>({ok:false,status:503}),
    sleepImpl:async()=>{},log:quiet}),/LIVE_PDF_VERIFICATION_FAILED.*live fetch failure/);
}));
test('rejects untrusted URL schemes and bad commit',async()=>withFixture(async file=>{
  await assert.rejects(verifyLivePdf({url:'file:///tmp/test.pdf',expectedFile:file,
    expectedSourceCommit:SHA}),/HTTPS URL required/);
  await assert.rejects(verifyLivePdf({url,expectedFile:file,
    expectedSourceCommit:'invalid'}),/source commit/);
}));
