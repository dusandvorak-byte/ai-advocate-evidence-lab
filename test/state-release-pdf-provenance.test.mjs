import test from 'node:test';
import assert from 'node:assert/strict';

import { verifiedStatePdfProvenance } from '../scripts/state-release-pdf-provenance.mjs';

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
