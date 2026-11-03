import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIntake} from './validate.mjs';
const valid=()=>({
 schema_version:'intake-v1',submission_id:'123e4567-e89b-42d3-a456-426614174000',
 user_title:'Usnesení soudu – listopad 2026',institution_id:'court-test',
 document_type:'usneseni',issue_date:'2026-11-03',received_date:null,
 reference:'DEMO-123/2026',case_ids:[],requested_state:'review',
 privacy_status:'pending',source:{origin:'internal_upload',original_sha256:null,malware_scan:'pending'},notes:'Synthetic example'
});
test('accepts synthetic review intake',()=>assert.deepEqual(validateIntake(valid()),[]));
test('rejects invalid dates',()=>{const x=valid();x.issue_date='2026-02-31';assert.ok(validateIntake(x).length)});
test('does not accept verified/uploaded source',()=>{const x=valid();x.source.original_sha256='a'.repeat(64);assert.ok(validateIntake(x).length)});
test('rejects direct publication',()=>{const x=valid();x.requested_state='published';assert.ok(validateIntake(x).length)});
test('rejects duplicate case identifiers',()=>{const x=valid();x.case_ids=['x','x'];assert.ok(validateIntake(x).length)});
test('rejects unknown fields',()=>{const x=valid();x.public_url='https://example.org';assert.ok(validateIntake(x).length)});
test('rejects missing institution',()=>{const x=valid();x.institution_id='';assert.ok(validateIntake(x).length)});
