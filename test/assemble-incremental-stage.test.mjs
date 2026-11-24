import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planIncrementalRelease, inventory, treeDigest } from '../scripts/plan-incremental-release.mjs';
import { assembleIncrementalStage } from '../scripts/assemble-incremental-stage.mjs';

async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(),'evidence-stage-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const baseline=path.join(dir,'base'), candidate=path.join(dir,'full'), overlay=path.join(dir,'delta'), output=path.join(dir,'stage');
  async function put(root,rel,content) {
    const file=path.join(root,rel);
    await mkdir(path.dirname(file),{recursive:true});
    await writeFile(file,content);
  }
  for(const root of [baseline,candidate]) {
    await put(root,'documents/old.pdf','%PDF-old');
    await put(root,'web/documents/old.pdf','%PDF-old');
  }
  await put(baseline,'index.html','old');
  for(const root of [candidate,overlay]) {
    await put(root,'index.html','new');
    await put(root,'documents/new.pdf','%PDF-new');
    await put(root,'web/documents/new.pdf','%PDF-new');
  }
  const plan=await planIncrementalRelease(baseline,candidate);
  const opts={baseline,overlay,output,plan,expectedBaseline:plan.baseline_tree_sha256,expectedCandidate:plan.candidate_tree_sha256};
  return {opts,candidate,put};
}
test('stage equals reference full tree without using reference at assembly',async t=>{
  const {opts,candidate}=await setup(t);
  const expected=treeDigest(await inventory(candidate));
  await rm(candidate,{recursive:true});
  const result=await assembleIncrementalStage(opts);
  assert.equal(result.tree_sha256,expected);
  assert.equal(treeDigest(await inventory(opts.output)),expected);
  assert.equal(await readFile(path.join(opts.baseline,'index.html'),'utf8'),'old');
  assert.equal(result.mode,'shadow-only');
});
test('tampered baseline fails before output',async t=>{
  const {opts,put}=await setup(t);
  await put(opts.baseline,'index.html','tampered');
  await assert.rejects(assembleIncrementalStage(opts),/Baseline digest mismatch/);
  await assert.rejects(access(opts.output));
});
test('tampered overlay fails',async t=>{
  const {opts,put}=await setup(t);
  await put(opts.overlay,'index.html','tampered');
  await assert.rejects(assembleIncrementalStage(opts),/Overlay inventory mismatch/);
});
test('unexpected extra overlay file fails',async t=>{
  const {opts,put}=await setup(t);
  await put(opts.overlay,'extra.html','unexpected');
  await assert.rejects(assembleIncrementalStage(opts),/Overlay inventory mismatch/);
});
test('missing overlay file fails',async t=>{
  const {opts}=await setup(t);
  await rm(path.join(opts.overlay,'web/documents/new.pdf'));
  await assert.rejects(assembleIncrementalStage(opts),/Overlay inventory mismatch/);
});
test('traversal plan fails',async t=>{
  const {opts}=await setup(t);
  opts.plan.added[0].path='../outside.pdf';
  await assert.rejects(assembleIncrementalStage(opts),/Unsafe or duplicate/);
});
test('unexpected candidate digest fails',async t=>{
  const {opts}=await setup(t);
  opts.expectedCandidate='0'.repeat(64);
  await assert.rejects(assembleIncrementalStage(opts),/unbound/);
});
test('existing output is never overwritten',async t=>{
  const {opts,put}=await setup(t);
  await put(opts.output,'keep.txt','keep');
  await assert.rejects(assembleIncrementalStage(opts),/EEXIST/);
  assert.equal(await readFile(path.join(opts.output,'keep.txt'),'utf8'),'keep');
});
test('cannot write inside baseline',async t=>{
  const {opts}=await setup(t);
  opts.output=path.join(opts.baseline,'stage');
  await assert.rejects(assembleIncrementalStage(opts),/disjoint/);
});
test('historical PDF replacement is forbidden even with a spoofed append-only plan',async t=>{
  const {opts}=await setup(t);
  const row=opts.plan.changed[0];
  row.path='documents/old.pdf';
  row.previous_sha256=(await inventory(opts.baseline)).get(row.path);
  await assert.rejects(assembleIncrementalStage(opts),/Historical PDF change/);
});
