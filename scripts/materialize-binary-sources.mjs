import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const manifestPath = 'project-memory/binary-sources/manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest.files)) throw new Error('binary-sources/manifest.json nemá pole files');

for (const item of manifest.files) {
  if (!item.target || !item.sha256 || !Array.isArray(item.chunks) || !item.chunks.length) {
    throw new Error(`Neúplný binární manifest: ${JSON.stringify(item)}`);
  }
  let b64 = '';
  for (const chunk of item.chunks) b64 += (await readFile(chunk, 'utf8')).trim();
  const data = Buffer.from(b64, 'base64');
  if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${item.target}: materializovaný soubor není PDF`);
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== item.sha256) throw new Error(`${item.target}: SHA-256 ${sha} neodpovídá očekávanému ${item.sha256}`);
  await mkdir(path.dirname(item.target), { recursive: true });
  await writeFile(item.target, data);
  console.log(`Materializováno ${item.target} (${data.length} B, SHA-256 ${sha})`);
}
