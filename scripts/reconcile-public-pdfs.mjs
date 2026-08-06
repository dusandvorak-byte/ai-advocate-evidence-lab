import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const registryPath = 'project-memory/documents-2026.json';
const memoryDir = 'project-memory';
const webDir = 'web';

const exists = file => access(file).then(() => true).catch(() => false);
const norm = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/čj|c\.\s*j\.|sp\.\s*zn\.|spzn/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const compact = value => norm(value).replace(/\s+/g, '');
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full.replaceAll('\\', '/'));
  }
  return out;
}

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('Kanonický registr neobsahuje pole documents');

const sourceFiles = (await readdir(memoryDir))
  .filter(name => /^report-.*-sources\.json$/i.test(name))
  .map(name => `${memoryDir}/${name}`);
const sources = [];
for (const file of sourceFiles) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  for (const item of data.sources || []) {
    if (item.path && /\.pdf$/i.test(item.path)) sources.push({ ...item, source_manifest: file });
  }
}

const physicalPdfs = (await walk(`${webDir}/documents`)).filter(file => /\.pdf$/i.test(file));
const physicalSet = new Set(physicalPdfs);
const usedPaths = new Map();
const changes = [];
const unresolved = [];

for (const doc of registry.documents) {
  if (doc.public?.pdf) {
    const repoPath = `web/${publicPath(doc.public.pdf)}`;
    if (physicalSet.has(repoPath)) usedPaths.set(repoPath, doc.id);
    continue;
  }

  const ref = compact(doc.reference);
  const date = doc.issue_date;
  let candidates = sources.filter(src => {
    const sameDate = !src.date || !date || src.date === date;
    const sourceRef = compact(src.reference);
    return sameDate && ref && sourceRef && (sourceRef === ref || sourceRef.includes(ref) || ref.includes(sourceRef));
  });

  if (!candidates.length && ref) {
    candidates = physicalPdfs
      .filter(file => compact(path.basename(file)).includes(ref))
      .map(file => ({ path: file }));
  }

  candidates = candidates.filter(src => physicalSet.has(src.path));
  const unique = [...new Map(candidates.map(src => [src.path, src])).values()];

  if (unique.length === 1) {
    const source = unique[0];
    const owner = usedPaths.get(source.path);
    if (owner && owner !== doc.id) throw new Error(`PDF ${source.path} je přiřazeno dvěma dokumentům: ${owner}, ${doc.id}`);
    doc.public ||= {};
    doc.public.pdf = publicPath(source.path);
    if (source.sha256) doc.public.sha256 = source.sha256;
    doc.public.verification_status = 'published';
    doc.public.source_manifest = source.source_manifest || 'filename-reconciliation';
    usedPaths.set(source.path, doc.id);
    changes.push({ id: doc.id, reference: doc.reference, pdf: doc.public.pdf });
  } else if (unique.length > 1) {
    unresolved.push({ id: doc.id, reference: doc.reference, reason: 'ambiguous', candidates: unique.map(x => x.path) });
  }
}

registry.reconciliation = {
  updated_at: new Date().toISOString(),
  source_manifests: sourceFiles,
  physical_pdf_count: physicalPdfs.length,
  linked_pdf_count: registry.documents.filter(item => item.public?.pdf).length,
  newly_linked_count: changes.length,
  unresolved_count: unresolved.length
};

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
await writeFile('project-memory/pdf-reconciliation-report.json', `${JSON.stringify({
  generated_at: new Date().toISOString(),
  physical_pdf_count: physicalPdfs.length,
  source_manifest_pdf_count: sources.length,
  newly_linked: changes,
  unresolved
}, null, 2)}\n`, 'utf8');

console.log(`PDF reconciliation: ${changes.length} nových vazeb, ${registry.reconciliation.linked_pdf_count} celkem aktivních PDF, ${unresolved.length} nejednoznačných.`);
