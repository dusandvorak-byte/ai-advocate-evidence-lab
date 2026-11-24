import test from 'node:test';
import assert from 'node:assert/strict';

import { verifiedStatePdfProvenance, verifiedGeneratedStatePdfProvenance } from '../scripts/state-release-pdf-provenance.mjs';
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

test('generated institutional PDF requires sealed unchanged or authenticated changed proof', () => {
  const id='doc-test-generated', orig='c'.repeat(64), input='d'.repeat(64), output='e'.repeat(64);
  const status='verified_deterministic_public_text_copy; not_byte_identical_original';
  const source={id,public:{pdf:rel,intended_pdf:rel,sha256:input,source_original_sha256:orig,source_original_page_count:3,verification_status:status}};
  const final=(sha=input,overrides={})=>({id,public:{...source.public,sha256:sha,verification_status:status+'; publication_policy_hardened',...overrides}});
  const evidence={id,public_path:rel,registered:true,changed:false,input_sha256:input,output_sha256:input,page_count:2,strategy:'kernel_sealed_authenticated_deep_scan',redaction_matches:[],trigger_reasons:[],text_fallback:null,known_private_identifier_hits_after:[],decoded_private_identifier_hits_after:[]};
  const check=(f,d,r=evidence,clean=true,s=source)=>verifiedGeneratedStatePdfProvenance({sourceDoc:s,finalDoc:f,digest:d,originalSha:orig,originalPages:3,hardeningById:new Map(r?[[id,r]]:[]),hardeningReportOk:clean});
  assert.equal(check(final(),input),true);
  assert.equal(check(final(),input,null),false);
  for(const damage of [{strategy:'verify_only'},{registered:false},{changed:true},{input_sha256:orig},{output_sha256:orig},{public_path:'wrong.pdf'},{trigger_reasons:['bad']},{decoded_private_identifier_hits_after:['hit']},{page_count:0}])
    assert.equal(check(final(),input,{...evidence,...damage}),false);
  assert.equal(check(final(),input,evidence,false),false);
  assert.equal(check(final(orig),orig,{...evidence,output_sha256:orig}),false);
  assert.equal(check(final(input,{verification_status:status}),input),false);
  assert.equal(check(final(output),output,{...evidence,changed:true,strategy:'pymupdf_rewrite',output_sha256:output}),true);
  assert.equal(check(final(output),output,{...evidence,changed:false,output_sha256:output}),false);
  assert.equal(check(final(output),output,{...evidence,changed:true,output_sha256:output,input_sha256:orig}),false);
});
