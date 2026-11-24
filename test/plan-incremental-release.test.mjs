import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planIncrementalRelease } from '../scripts/plan-incremental-release.mjs';

async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'evidence-delta-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const old = path.join(dir, 'old'), next = path.join(dir, 'next');
  async function put(root, name, bytes) {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  async function pdf(root, name, bytes) {
    await put(root, name, bytes);
    await put(root, 'web/' + name, bytes);
  }
  for (const root of [old, next]) {
    await pdf(root, 'documents/old.pdf', '%PDF-fixture-old');
    await put(root, 'index.html', 'old');
  }
  return { old, next, put, pdf };
}

test('new PDF pair and index change classified as advisory append-only', async t => {
  const {old,next,put,pdf} = await setup(t);
  await pdf(next, 'documents/new.pdf', '%PDF-fixture-new');
  await put(next, 'index.html', 'new');
  const result = await planIncrementalRelease(old,next);
  assert.equal(result.mode,'append-only-candidate');
  assert.equal(result.advisory_only,true);
  assert.equal(result.added.length,2);
  assert.equal(result.changed.length,1);
  assert.equal(result.unchanged_files,2);
});
test('changed historic PDF requires full path', async t => {
  const {old,next,pdf} = await setup(t);
  await pdf(next,'documents/old.pdf','%PDF-fixture-modified');
  const result = await planIncrementalRelease(old,next);
  assert.equal(result.mode,'full-required');
  assert.equal(result.historical_pdf_changed.length,2);
});
test('missing mirrored PDF fails closed', async t => {
  const {old,next,put} = await setup(t);
  await put(next,'documents/new.pdf','%PDF-fixture-new');
  await assert.rejects(planIncrementalRelease(old,next), /mirror mismatch/);
});
test('deleted historical pair requires full path', async t => {
  const {old,next} = await setup(t);
  await rm(path.join(next,'documents/old.pdf'));
  await rm(path.join(next,'web/documents/old.pdf'));
  assert.equal((await planIncrementalRelease(old,next)).mode,'full-required');
});
test('symlink is rejected', async t => {
  const {old,next} = await setup(t);
  await symlink(path.join(old,'index.html'),path.join(next,'alias.html'));
  await assert.rejects(planIncrementalRelease(old,next), /Non-regular/);
});
