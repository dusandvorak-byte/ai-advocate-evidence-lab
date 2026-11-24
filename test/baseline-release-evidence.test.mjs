import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {createBaselineEvidence,verifyBaselineEvidence} from '../scripts/baseline-release-evidence.mjs';

async function fixture(t) {
  const dir=await mkdtemp(path.join(tmpdir(),'evidence-baseline-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'stage'),reportPath=path.join(dir,'report.json');
  const source='a'.repeat(40),repository='example/evidence',runId='123',attempt='2';
  const expected={source,repository,runId,attempt};
  async function put(rel,data) {
    const f=path.join(root,rel);
    await mkdir(path.dirname(f),{recursive:true});await writeFile(f,data);
  }
  for(const prefix of ['','web/']) {
    await put(prefix+'.source-commit',source+'\n');
    await put(prefix+'.nojekyll','');
    await put(prefix+'documents/a.pdf','%PDF-a');
  }
  await put('index.html','old home');
  const hash=createHash('sha256').update('%PDF-a').digest('hex');
  const report={schema_version:'1.1-sliced',checkout_commit:source,github_event_sha:source,
    expected_pr_head_commit:source,base_is_ancestor:true,
    summary:{hard_failure_count:0,hard_failures:[],all_final_staged_pdf_count:2},
    registry_web_stage_reconciliation:{staged_set_exact_match:true,id69_absent_from_final_release_state:true},
    privacy_hardening:{hard_failure_count:0,hard_failures:[]},
    all_final_web_pdfs:['documents/a.pdf','web/documents/a.pdf'].map(published_path=>({published_path,sha256:hash,checks:{fixture:true}}))};
  async function save(){await writeFile(reportPath,JSON.stringify(report));}
  await save();
  const opts={root,reportPath,...expected};
  const manifest=await createBaselineEvidence(opts);
  const run={id:123,run_attempt:2,repository:{full_name:repository},head_repository:{full_name:repository},
    head_sha:source,path:'.github/workflows/trusted-pdf-shard-diagnostic.yml',head_branch:'main',event:'push',status:'completed',conclusion:'success'};
  return {put,report,save,opts,verify:{manifest,run,expected,root,reportPath}};
}
test('exact stage and run accepted without authorization or privacy reuse',async t=>{
  const {verify}=await fixture(t);
  const m=await verifyBaselineEvidence(verify);
  assert.equal(m.authorization_granted,false);assert.equal(m.privacy_reuse_granted,false);
});
test('modified HTML invalidates whole tree',async t=>{
  const {verify,put}=await fixture(t);await put('index.html','tampered');
  await assert.rejects(verifyBaselineEvidence(verify),/evidence mismatch/);
});
test('modified historical PDF bytes rejected',async t=>{
  const {verify,put}=await fixture(t);
  for(const p of ['','web/']) await put(p+'documents/a.pdf','%PDF-modified');
  await assert.rejects(verifyBaselineEvidence(verify),/PDF row mismatch/);
});
test('hidden PDF signature in another extension rejected',async t=>{
  const {verify,put}=await fixture(t);await put('extra.bin','prefix%PDF-hidden');
  await assert.rejects(verifyBaselineEvidence(verify),/PDF count mismatch/);
});
test('wrong run attempt rejected',async t=>{
  const {verify}=await fixture(t);verify.run.run_attempt=3;
  await assert.rejects(verifyBaselineEvidence(verify),/run identity/);
});
test('failed or PR audit rejected',async t=>{
  const {verify}=await fixture(t);verify.run.conclusion='failure';
  await assert.rejects(verifyBaselineEvidence(verify),/run identity/);
  verify.run.conclusion='success';verify.run.event='pull_request';
  await assert.rejects(verifyBaselineEvidence(verify),/run identity/);
});
test('audit hard failure rejected',async t=>{
  const {opts,report,save}=await fixture(t);report.summary.hard_failure_count=1;await save();
  await assert.rejects(createBaselineEvidence(opts),/Audit not clean/);
});
test('duplicate audit PDF row rejected',async t=>{
  const {opts,report,save}=await fixture(t);report.all_final_web_pdfs[1]=report.all_final_web_pdfs[0];await save();
  await assert.rejects(createBaselineEvidence(opts),/PDF row mismatch/);
});
test('withdrawn ID or failed PDF check rejected',async t=>{
  const {opts,report,save}=await fixture(t);
  report.registry_web_stage_reconciliation.id69_absent_from_final_release_state=false;await save();
  await assert.rejects(createBaselineEvidence(opts),/Audit not clean/);
  report.registry_web_stage_reconciliation.id69_absent_from_final_release_state=true;report.all_final_web_pdfs[0].checks.fixture=false;await save();
  await assert.rejects(createBaselineEvidence(opts),/PDF row mismatch/);
});
