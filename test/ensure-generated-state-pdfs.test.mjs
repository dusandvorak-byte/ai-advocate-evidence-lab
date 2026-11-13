import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatorGroups, missingGeneratedGroups, usablePdf } from '../scripts/ensure-generated-state-pdfs.mjs';

const OUT = 'web/documents/report-04082026-010';
const syntheticPdf = () => Buffer.from('%PDF-1.4\n' + 'S'.repeat(1024) + '\n%%EOF\n');

test('preflight identifies all missing generator groups in a clean isolated checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-pdf-preflight-'));
  try {
    const pending = await missingGeneratedGroups(root);
    assert.deepEqual(pending.map(g => g.generator), generatorGroups.map(g => g.generator));
    assert.equal(pending.reduce((n, group) => n + group.missing.length, 0), 24);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preflight does not regenerate verified existing groups; detects missing, short and invalid PDFs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-pdf-preflight-'));
  try {
    const dir = join(root, OUT);
    await mkdir(dir, { recursive: true });
    for (const group of generatorGroups) {
      for (const filename of group.files) await writeFile(join(dir, filename), syntheticPdf());
    }
    assert.deepEqual(await missingGeneratedGroups(root), []);
    await unlink(join(dir, generatorGroups[0].files[1]));
    await writeFile(join(dir, generatorGroups[2].files[0]), Buffer.from('%PDF-1.4\n%%EOF'));
    await writeFile(join(dir, generatorGroups[3].files[0]), Buffer.alloc(2048, 32));
    const pending = await missingGeneratedGroups(root);
    assert.deepEqual(pending.map(g => g.generator), [
      generatorGroups[0].generator, generatorGroups[2].generator, generatorGroups[3].generator
    ]);
    assert.deepEqual(pending.map(g => g.missing.length), [1, 1, 1]);
    assert.equal(await usablePdf(join(dir, generatorGroups[0].files[0])), true);
    assert.equal(await usablePdf(join(dir, generatorGroups[2].files[0])), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
