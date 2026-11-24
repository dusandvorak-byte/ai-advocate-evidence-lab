import { readFile, access, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const fail = message => { throw new Error('RELEASE-EXCLUSIONS: ' + message); };
const id = 'doc-cz-pcr-krpt-2026-08-20-metodicko-odborne-vyjezdy-okte';
const filename = '69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf';
const sourceText = 'project-memory/state-extracted-2026-08-25/69.txt';
const withdrawnSha256 = 'e73fcf803f59c4ed58cfb0ff01ee773cfedbd2782426132d3feeb715655d0ca2';

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

const sourcesStart = generator.indexOf('SOURCES = {');
const sourcesEnd = generator.indexOf('\nFONT_CANDIDATES = [', sourcesStart);
if (sourcesStart < 0 || sourcesEnd < 0) fail('cannot locate state PDF SOURCES block');
const sourceBlock = generator.slice(sourcesStart, sourcesEnd);
if (sourceBlock.includes(filename)) fail('ID 69 is still present in the state PDF generation source map');

const groupStart = preflight.indexOf("generator: 'scripts/materialize-godot-state-text-pdfs.py'");
const groupEnd = preflight.indexOf('\n  },', groupStart);
if (groupStart < 0 || groupEnd < 0) fail('cannot locate state PDF provenance group');
const provenanceGroup = preflight.slice(groupStart, groupEnd);
if (provenanceGroup.includes(filename)) fail('ID 69 is still required by generated-PDF provenance preflight');

const forbiddenIdBytes = Buffer.from(id, 'utf8');
const forbiddenFilenameBytes = Buffer.from(filename, 'utf8');

async function scanPublicTree(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative('.', full).replaceAll('\\\\','/');
    if (entry.name.includes(id) || entry.name.includes(filename)) {
      fail('ID 69 leaked into public output filename/path: ' + rel);
    }
    if (entry.isDirectory()) {
      await scanPublicTree(full);
      continue;
    }
    if (!entry.isFile()) continue;
    const bytes = await readFile(full);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest === withdrawnSha256) {
      fail('withdrawn ID 69 digest leaked into public output under any name: ' + rel);
    }
    if (bytes.includes(forbiddenIdBytes) || bytes.includes(forbiddenFilenameBytes)) {
      fail('ID 69 leaked into public output bytes: ' + rel);
    }
  }
}

await scanPublicTree('web');

console.log('Release exclusions OK: ID 69 absent from complete public web tree, canonical/public registries and generation/provenance maps; historical source evidence preserved.');
