import test from 'node:test';
import assert from 'node:assert/strict';

import { verifiedStatePdfProvenance } from '../scripts/state-release-pdf-provenance.mjs';
import { verifiedEkkPublicCopy } from '../scripts/ekk-public-text-provenance.mjs';

const sourceSha = '1'.repeat(64);
const hardenedSha = '2'.repeat(64);
const rel = 'documents/state/example.pdf';
const file = {
  document_id: 'doc-test',
  source_sha256: sourceSha,
  public_sha256: sourceSha,
  public_pdf: rel,
};
const doc = (digest, status = 'source_pdf_received_binary_original') => ({
  id: 'doc-test',
  public: { pdf: rel, sha256: digest, verification_status: status },
});
const row = (overrides = {}) => ({
  id: 'doc-test',
  changed: true,
  public_path: rel,
  input_sha256: sourceSha,
  output_sha256: hardenedSha,
  known_private_identifier_hits_after: [],
  decoded_private_identifier_hits_after: [],
  ...overrides,
});
const check = (docValue, digest, evidenceRow, clean = true) => verifiedStatePdfProvenance({
  file, doc: docValue, digest,
  hardeningById: new Map(evidenceRow ? [['doc-test', evidenceRow]] : []),
  hardeningReportOk: clean,
});

test('original state PDF remains strictly bound to immutable source and registry', () => {
  assert.equal(check(doc(sourceSha), sourceSha), true);
  assert.equal(check(doc('3'.repeat(64)), sourceSha), false);
  assert.equal(verifiedStatePdfProvenance({ file: {...file, source_sha256:'4'.repeat(64)}, doc:doc(sourceSha), digest:sourceSha, hardeningById:new Map(), hardeningReportOk:true }), false);
});

test('privacy-hardened public derivative requires authenticated exact input/output hashes', () => {
  const hardenedDoc = doc(hardenedSha, 'source_pdf_received_binary_original; publication_policy_hardened');
  assert.equal(check(hardenedDoc,hardenedSha,row()),true);
  assert.equal(check(hardenedDoc,hardenedSha,row({input_sha256:'3'.repeat(64)})),false);
  assert.equal(check(hardenedDoc,hardenedSha,row({output_sha256:'3'.repeat(64)})),false);
  assert.equal(check(hardenedDoc,hardenedSha,row({public_path:'documents/other.pdf'})),false);
  assert.equal(check(hardenedDoc,hardenedSha,row({known_private_identifier_hits_after:['secret_hit']})),false);
  assert.equal(check(hardenedDoc,hardenedSha,row({decoded_private_identifier_hits_after:['secret_hit']})),false);
  assert.equal(check(hardenedDoc,hardenedSha,row(),false),false);
  assert.equal(check(hardenedDoc,hardenedSha),false);
  assert.equal(check(doc(hardenedSha),hardenedSha,row()),false);
});

test('changed public PDF cannot be falsely labelled source-identical', () => {
  const hardenedDoc = doc(hardenedSha,'source_pdf_received_binary_original; publication_policy_hardened');
  assert.equal(verifiedStatePdfProvenance({
    file:{...file,public_sha256:'3'.repeat(64)},
    doc:hardenedDoc,digest:hardenedSha,hardeningById:new Map([['doc-test',row()]]),
    hardeningReportOk:true,
  }),false);
});

const ekkSha = 'a'.repeat(64);
const ekkFinalSha = 'b'.repeat(64);
const ekkSource = {
  id: 'doc-test-ekk',
  public: {pdf:'documents/ekk-copy.pdf', sha256:ekkSha,
    verification_status:'verified_text_public_copy_from_complete_extracted_text'}
};
const ekkFinal = (sha=ekkSha,status='verified_text_public_copy_from_complete_extracted_text') => ({
  id:ekkSource.id, public:{pdf:ekkSource.public.pdf,sha256:sha,verification_status:status}
});
const ekkRow = (changes={}) => ({
  id:ekkSource.id, public_path:ekkSource.public.pdf,
  changed:true, input_sha256:ekkSha, output_sha256:ekkFinalSha,
  known_private_identifier_hits_after:[],
  decoded_private_identifier_hits_after:[], ...changes
});
const ekkReport = (rows=[], failures=[]) => ({
  hard_failure_count:failures.length,hard_failures:failures,documents:rows
});
const ekkCheck=(finalDoc,digest,report)=>verifiedEkkPublicCopy({
  sourceDoc:ekkSource, finalDoc, digest, report
});

test('EKK: unchanged generated copy requires exact source, registry and clean audit', () => {
  assert.equal(ekkCheck(ekkFinal(),ekkSha,ekkReport()),true);
  assert.equal(ekkCheck(ekkFinal(),ekkSha,ekkReport([ekkRow({changed:false,output_sha256:ekkSha})])),true);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha),ekkFinalSha,ekkReport()),false);
  assert.equal(ekkCheck(ekkFinal(),ekkFinalSha,ekkReport()),false);
  assert.equal(ekkCheck(ekkFinal(),ekkSha,ekkReport([],['private identifier found'])),false);
  assert.equal(ekkCheck(ekkFinal(),ekkSha,ekkReport([ekkRow()])),false);
});

test('EKK: changed generated copy requires authenticated exact SHA bridge and clean privacy evidence', () => {
  const status='verified_text_public_copy_from_complete_extracted_text; publication_policy_hardened';
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport([ekkRow()])),true);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport()),false);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport([ekkRow({input_sha256:'c'.repeat(64)})])),false);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport([ekkRow({output_sha256:'c'.repeat(64)})])),false);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport([ekkRow({public_path:'wrong.pdf'})])),false);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport([ekkRow({known_private_identifier_hits_after:['hit']})])),false);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport([ekkRow({decoded_private_identifier_hits_after:['hit']})])),false);
  assert.equal(ekkCheck(ekkFinal(ekkFinalSha,status),ekkFinalSha,ekkReport([ekkRow(),ekkRow()])),false);
});
