import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generatorGroups,
  staleGeneratedGroups,
  buildState,
  writeBuildState,
} from '../scripts/ensure-generated-state-pdfs.mjs';

const OUT = 'web/documents/report-04082026-010';
const syntheticPdf = marker => Buffer.from('%PDF-1.4\n' + String(marker).repeat(1100) + '\n%%EOF\n');
const signatures = suffix => ({
  schema_version: '1.0',
  groups: Object.fromEntries(generatorGroups.map((group, index) => [
    group.generator,
    { input_fingerprint: `fingerprint-${index}-${suffix}`, components: [] },
  ])),
});

async function populate(root) {
  const dir = join(root, OUT);
  await mkdir(dir, { recursive: true });
  let marker = 0;
  for (const group of generatorGroups) {
    for (const filename of group.files) {
      await writeFile(join(dir, filename), syntheticPdf(String(++marker % 10)));
    }
  }
}

test('clean or copied checkout without provenance state regenerates every generator group', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-pdf-preflight-'));
  try {
    await populate(root);
    const pending = await staleGeneratedGroups(root, signatures('v1'));
    assert.deepEqual(pending.map(x => x.generator), generatorGroups.map(x => x.generator));
    assert.ok(pending.every(x => x.reasons.includes('missing_build_signature')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('matching input fingerprints and output SHA permit verified incremental reuse', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-pdf-preflight-'));
  try {
    await populate(root);
    const current = signatures('v1');
    await writeBuildState(root, await buildState(root, current));
    assert.deepEqual(await staleGeneratedGroups(root, current), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('redaction policy/source/generator fingerprint change forces regeneration even for valid PDFs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-pdf-preflight-'));
  try {
    await populate(root);
    const oldSignatures = signatures('v1');
    await writeBuildState(root, await buildState(root, oldSignatures));
    const changed = signatures('v1');
    changed.groups[generatorGroups[1].generator] = {
      input_fingerprint: 'redaction-policy-or-source-changed',
      components: [],
    };
    const pending = await staleGeneratedGroups(root, changed);
    assert.deepEqual(pending.map(x => x.generator), [generatorGroups[1].generator]);
    assert.ok(pending[0].reasons.includes('input_fingerprint_changed'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('tampered or replaced output forces regeneration even when inputs are unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-pdf-preflight-'));
  try {
    await populate(root);
    const current = signatures('v1');
    await writeBuildState(root, await buildState(root, current));
    const filename = generatorGroups[2].files[0];
    await writeFile(join(root, OUT, filename), syntheticPdf('X'));
    const pending = await staleGeneratedGroups(root, current);
    assert.deepEqual(pending.map(x => x.generator), [generatorGroups[2].generator]);
    assert.ok(pending[0].reasons.some(x => x === `output_sha_changed:${filename}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
