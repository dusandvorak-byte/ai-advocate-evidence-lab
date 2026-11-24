import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const id = 'doc-cz-dd-2026-11-23-os-praha4-10-c-69-2026-ct-doplneni';
const approved = '13762205a406156e15e488c3936523facd10ee55f24c5c7fa908f924440a7aa8';
const pdf = 'documents/2026-11-23/2026-11-23-os-praha4-10-c-69-2026-ct-doplneni.pdf';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--staged')) throw new Error('Unknown verification mode');
const pairs = args.length ? [
  ['release-site','release-site/data/documents-2026.json'],
  ['release-site/web','release-site/web/data/documents-2026.json'],
] : [['web','project-memory/documents-2026.json'], ['web','web/data/documents-2026.json']];
for (const [root, registryPath] of pairs) {
  const registry = JSON.parse(await readFile(registryPath,'utf8'));
  const records = registry.documents.filter(d => d.id === id);
  if (records.length !== 1 || records[0].public?.pdf !== pdf || records[0].public?.sha256 !== approved) throw new Error('Approved CT pilot registry identity or digest changed: '+registryPath);
  const bytes = await readFile(join(root,pdf));
  if (bytes.length !== 1306798 || createHash('sha256').update(bytes).digest('hex') !== approved) throw new Error('Approved CT pilot binary changed: publication blocked; obtain exact approval for any replacement');
}
console.log('CT_PILOT_EXACT_OWNER_APPROVED_DIGEST_OK '+(args.length?'staged tree':'terminal build'));
