import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPinnedLatePair} from '../scripts/late-original-public-provenance.mjs';

const source=Buffer.from('%PDF-1.4\narchival bytes\n%%EOF\n');
const copy=Buffer.from('%PDF-1.4\nredacted bytes\n%%EOF\n');
const sha=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const id='doc-fixture-late',path='documents/fixture.pdf';
const pin={id,path,source_sha256:sha(source),source_size:source.length,pages:2,public_sha256:sha(copy),public_size:copy.length,public_git_blob:blob(copy),kind:'redact'};
const sourceRecord={id,public:{pdf:path,source_original_sha256:pin.source_sha256,source_original_size_bytes:source.length,source_original_page_count:2,sha256:pin.source_sha256}};
const final={id,public:{...sourceRecord.public,sha256:pin.public_sha256,verification_status:'published; publication_policy_hardened'}};
const row={id,registered:true,changed:true,public_path:path,input_sha256:pin.source_sha256,output_sha256:pin.public_sha256,page_count:2,strategy:'redact',text_fallback:null,redaction_matches:[{page:1,rule:'synthetic'}],known_private_identifier_hits_after:[],decoded_private_identifier_hits_after:[]};
const args={pin,original:source,publicCopy:copy,sourceRecord,finalRecords:[final,final],hardeningReportOk:true,hardeningById:new Map([[id,row]])};
test('original and independent already-public pin must both match authenticated clean provenance',()=>{
 assert.equal(verifyPinnedLatePair(args),true);
 for(const overrides of [{original:copy},{publicCopy:source},{hardeningReportOk:false},{finalRecords:[final]},{sourceRecord:{...sourceRecord,public:{...sourceRecord.public,sha256:sha(copy)}}}])assert.throws(()=>verifyPinnedLatePair({...args,...overrides}),/LATE-ORIGINAL-PROVENANCE/);
 for(const damage of [{registered:false},{page_count:1},{redaction_matches:[]},{strategy:'verify_only'},{text_fallback:{}},{decoded_private_identifier_hits_after:['synthetic']},{input_sha256:'f'.repeat(64)}])assert.throws(()=>verifyPinnedLatePair({...args,hardeningById:new Map([[id,{...row,...damage}]])}),/LATE-ORIGINAL-PROVENANCE/);
 const replacement=Buffer.from('%PDF-1.4\nreplacement\n%%EOF\n');
 assert.throws(()=>verifyPinnedLatePair({...args,publicCopy:replacement,finalRecords:[{...final,public:{...final.public,sha256:sha(replacement)}},final],hardeningById:new Map([[id,{...row,output_sha256:sha(replacement)}]])}),/pinned public bytes mismatch/);
});
test('53 page fallback is distinct from redaction and cannot claim original fidelity',()=>{
 const p={...pin,kind:'text_fallback',fallback_input_sha256:'a'.repeat(64)};
 const f={source_sha256:p.source_sha256,output_sha256:p.public_sha256,fallback_input_sha256:p.fallback_input_sha256,source_page_count:2,output_page_count:2,nonempty_page_count:2,fallback_input_page_count:2,deterministic:true,output_text_verified:true,poppler_ok:true};
 const r={...row,strategy:'pymupdf_rewrite+text_fallback',text_fallback:f};
 const d={...final,public:{...final.public,verification_status:'published; publication_policy_hardened; not_byte_identical_original'}};
 const testArgs={...args,pin:p,finalRecords:[d,d],hardeningById:new Map([[id,r]])};
 assert.equal(verifyPinnedLatePair(testArgs),true);
 assert.throws(()=>verifyPinnedLatePair({...testArgs,finalRecords:[final,final]}),/fallback evidence/);
 assert.throws(()=>verifyPinnedLatePair({...testArgs,hardeningById:new Map([[id,{...r,text_fallback:{...f,output_text_verified:false}}]])}),/fallback evidence/);
});

