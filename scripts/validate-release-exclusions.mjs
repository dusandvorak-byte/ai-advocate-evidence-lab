import { readFile, access } from 'node:fs/promises';

const fail = message => { throw new Error('RELEASE-EXCLUSIONS: ' + message); };
const id = 'doc-cz-pcr-krpt-2026-08-20-metodicko-odborne-vyjezdy-okte';
const filename = '69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf';
const sourceText = 'project-memory/state-extracted-2026-08-25/69.txt';

const sourceBatch = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-08-20-24.json','utf8'));
const source = sourceBatch.documents.find(item => item.id === id);
if (!source) fail('historical source record for ID 69 is missing');
if (source.release_excluded !== true || source.public?.pdf !== null || source.public?.sha256 !== null) {
  fail('ID 69 source record is not explicitly release-excluded');
}
await access(sourceText).catch(() => fail('historical ID 69 source evidence was deleted'));

const canonical = JSON.parse(await readFile('project-memory/documents-2026.json','utf8'));
if (canonical.documents.some(item => item.id === id)) fail('ID 69 leaked into canonical registry');

const publicRegistry = JSON.parse(await readFile('web/data/documents-2026.json','utf8'));
if (publicRegistry.documents.some(item => item.id === id)) fail('ID 69 leaked into public registry');

const withdrawnPublicPath = 'web/documents/report-04082026-010/' + filename;
try {
  await access(withdrawnPublicPath);
  fail('withdrawn ID 69 PDF still exists in public web tree');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const generator = await readFile('scripts/materialize-godot-state-text-pdfs.py','utf8');
const preflight = await readFile('scripts/ensure-generated-state-pdfs.mjs','utf8');
if (generator.includes(filename) || preflight.includes(filename)) fail('ID 69 is still required by a release generator');

for (const path of [
  'web/index.html','web/en.html','web/kc/index.html','web/kc/en.html',
  'web/zpravy/04082026-010.html','web/news/04082026-010.html'
]) {
  const html = await readFile(path,'utf8');
  if (html.includes(id) || html.includes(filename)) fail('ID 69 leaked into public navigation: ' + path);
}

console.log('Release exclusions OK: ID 69 absent from canonical/public release outputs; historical source evidence preserved.');
