import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyHeldCtPublicRoot} from '../scripts/verify-approved-ct-pilot.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
test('held CT pilot rejects renamed approved and source PDFs and leaked references, accepts unrelated files', async () => {
  const root = await mkdtemp(join(tmpdir(),'ct-hold-'));
  const approved = Buffer.from('%PDF-1.4\napproved fixture\n%%EOF\n');
  const source = Buffer.from('%PDF-1.4\nsource fixture\n%%EOF\n');
  const pins = {id:'doc-test-held',pdf:'documents/held-test.pdf',approved:sha(approved),sourceOriginal:sha(source),size:approved.length};
  try {
    await mkdir(join(root,'web'));
    await writeFile(join(root,'index.html'),'unrelated document');
    await verifyHeldCtPublicRoot(root,pins);
    const dest = join(root,'web','renamed.pdf');
    await writeFile(dest,approved);
    await assert.rejects(verifyHeldCtPublicRoot(root,pins),/approved binary leaked/);
    await writeFile(dest,source);
    await assert.rejects(verifyHeldCtPublicRoot(root,pins),/source binary leaked/);
    await rm(dest);
    for (const marker of [pins.id,'held-test.pdf',pins.approved,pins.sourceOriginal]) {
      await writeFile(join(root,'web','index.html'),marker);
      await assert.rejects(verifyHeldCtPublicRoot(root,pins),/identifier, path or digest leaked/);
    }
    await rm(join(root,'web','index.html'));
    await writeFile(join(root,'web','held-test.pdf'),'renamed different bytes');
    await assert.rejects(verifyHeldCtPublicRoot(root,pins),/held path leaked/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
