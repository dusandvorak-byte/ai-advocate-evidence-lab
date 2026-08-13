import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const manifestPath = 'project-memory/binary-sources/manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('binary-sources/manifest.json nemá neprázdné pole files');

for (const item of manifest.files) {
  const parts = item.parts || item.chunks;
  if (!item.target || !item.sha256 || !Array.isArray(parts) || !parts.length) {
    throw new Error(`Neúplný binární manifest: ${JSON.stringify(item)}`);
  }
  let b64 = '';
  for (const part of parts) b64 += (await readFile(part, 'utf8')).replace(/\s+/g, '');
  let data = Buffer.from(b64, 'base64');
  if (item.compression === 'xz') {
    const safe = createHash('sha256').update(item.target).digest('hex').slice(0, 16);
    const tmp = `/tmp/evidence-${safe}.xz`;
    await writeFile(tmp, data);
    try {
      data = execFileSync('xz', ['-dc', tmp], { encoding: null, maxBuffer: 32 * 1024 * 1024 });
    } finally {
      await unlink(tmp).catch(() => {});
    }
  } else if (item.compression && item.compression !== 'none') {
    throw new Error(`${item.target}: nepodporovaná komprese ${item.compression}`);
  }
  if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${item.target}: materializovaný soubor není PDF`);
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== item.sha256) throw new Error(`${item.target}: SHA-256 ${sha} neodpovídá očekávanému ${item.sha256}`);
  await mkdir(path.dirname(item.target), { recursive: true });
  await writeFile(item.target, data);
  console.log(`Materializováno ${item.target} (${data.length} B, SHA-256 ${sha})`);
}
