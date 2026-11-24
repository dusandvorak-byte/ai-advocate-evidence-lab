import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureShadowInputs, requireShadowInputs, verifyShadowOutputs } from '../scripts/shadow-surface-inputs.mjs';

async function fixture(t) {
  const root=await mkdtemp(path.join(tmpdir(),'evidence-surfaces-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  async function put(rel,bytes) {
    const dest=path.join(root,rel);
    await mkdir(path.dirname(dest),{recursive:true});
    await writeFile(dest,bytes);
  }
  await put('web/documents/a.pdf','%PDF-a');
  await put('web/data/documents-2026.json','{"documents":[]}');
  await put('web/data/pdf-reconciliation-report.json','{}');
  await put('project-memory/documents-2026.json','{"documents":[]}');
  await put('project-memory/privacy-hardening-report.json','{}');
  await put('project-memory/pdf-reconciliation-report.json','{}');
  await put('scripts/fixture.mjs','// synthetic');
  return {root,put};
}
test('surface refresh accepts exact inputs and unchanged PDF/registry',async t=>{
  const {root,put}=await fixture(t);
  const fingerprint=await captureShadowInputs(root);
  const before=await requireShadowInputs(root,fingerprint.inputSha);
  await put('web/index.html','updated CZ');
  await put('web/en.html','updated EN');
  assert.equal((await verifyShadowOutputs(root,before)).mode,'shadow-only');
});
test('stale input digest rejected',async t=>{
  const {root,put}=await fixture(t);
  const before=await captureShadowInputs(root);
  await put('scripts/fixture.mjs','changed');
  await assert.rejects(requireShadowInputs(root,before.inputSha),/digest mismatch/);
});
test('missing fingerprint rejected',async t=>{
  const {root}=await fixture(t);
  await assert.rejects(requireShadowInputs(root,''),/Exact prepared input/);
});
test('Git checkout rejected',async t=>{
  const {root,put}=await fixture(t);
  await put('.git','gitdir: /tmp/invalid');
  await assert.rejects(captureShadowInputs(root),/outside any Git checkout/);
});
test('PDF mutation rejected',async t=>{
  const {root,put}=await fixture(t);
  const before=await captureShadowInputs(root);
  await put('web/documents/a.pdf','%PDF-changed');
  await assert.rejects(verifyShadowOutputs(root,before),/modified PDF inventory/);
});
test('new PDF during surface phase rejected',async t=>{
  const {root,put}=await fixture(t);
  const before=await captureShadowInputs(root);
  await put('web/documents/b.pdf','%PDF-new');
  await assert.rejects(verifyShadowOutputs(root,before),/modified PDF inventory/);
});
test('canonical registry mutation rejected',async t=>{
  const {root,put}=await fixture(t);
  const before=await captureShadowInputs(root);
  await put('project-memory/documents-2026.json','{"documents":[{}]}');
  await assert.rejects(verifyShadowOutputs(root,before),/modified canonical registry/);
});
test('public registry mismatch rejected',async t=>{
  const {root,put}=await fixture(t);
  const before=await captureShadowInputs(root);
  await put('web/data/documents-2026.json','{"documents":[{}]}');
  await assert.rejects(verifyShadowOutputs(root,before),/Published registry mismatch/);
});
test('incomplete prepared inputs rejected',async t=>{
  const {root}=await fixture(t);
  await rm(path.join(root,'project-memory/privacy-hardening-report.json'));
  await assert.rejects(captureShadowInputs(root),/inputs incomplete/);
});
