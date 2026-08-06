import { access, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const registryPath = 'project-memory/documents-2026.json';
const institutionsPath = 'project-memory/institutions.json';
const memoryDir = 'project-memory';
const webDir = 'web';
const allowedInstitutionTypes = new Set(['ministry', 'executive_office', 'prosecution', 'police', 'police_lab']);

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

async function isUsablePdf(file) {
  if (!await exists(file)) return false;
  const info = await stat(file);
  if (!info.isFile() || info.size < 1024) return false;
  const data = await readFile(file);
  if (data.subarray(0, 5).toString() !== '%PDF-') return false;
  return data.subarray(Math.max(0, data.length - 2048)).toString('latin1').includes('%%EOF');
}

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const institutions = JSON.parse(await readFile(institutionsPath, 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('Kanonický registr neobsahuje pole documents');
if (!Array.isArray(institutions.institutions)) throw new Error('Registr institucí neobsahuje pole institutions');
const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));
const mayHaveActivePdf = doc => allowedInstitutionTypes.has(institutionMap.get(doc.institution_id)?.type);

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

const allPhysicalPdfs = (await walk(`${webDir}/documents`)).filter(file => /\.pdf$/i.test(file));
const validity = new Map();
for (const file of allPhysicalPdfs) validity.set(file, await isUsablePdf(file));
const validPhysicalPdfs = allPhysicalPdfs.filter(file => validity.get(file));
const validPhysicalSet = new Set(validPhysicalPdfs);
const usedPaths = new Map();
const changes = [];
const unresolved = [];
const invalidated = [];
const withheldByPolicy = [];

for (const doc of registry.documents) {
  doc.public ||= {};
  const allowed = mayHaveActivePdf(doc);

  if (!allowed && doc.public.pdf) {
    withheldByPolicy.push({ id: doc.id, institution_id: doc.institution_id, previous_pdf: doc.public.pdf });
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'catalogued_no_public_link';
    continue;
  }

  if (doc.public.pdf) {
    const repoPath = `web/${publicPath(doc.public.pdf)}`;
    if (validPhysicalSet.has(repoPath)) {
      usedPaths.set(repoPath, doc.id);
      doc.public.verification_status = 'published';
      continue;
    }
    invalidated.push({ id: doc.id, institution_id: doc.institution_id, invalid_pdf: doc.public.pdf });
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'invalid_public_file';
  }

  if (!allowed) continue;

  const ref = compact(doc.reference);
  const date = doc.issue_date;
  let candidates = sources.filter(src => {
    const sameDate = !src.date || !date || src.date === date;
    const sourceRef = compact(src.reference);
    return sameDate && ref && sourceRef && (sourceRef === ref || sourceRef.includes(ref) || ref.includes(sourceRef));
  });

  if (!candidates.length && ref) {
    candidates = validPhysicalPdfs
      .filter(file => compact(path.basename(file)).includes(ref))
      .map(file => ({ path: file }));
  }

  candidates = candidates.filter(src => validPhysicalSet.has(src.path));
  const unique = [...new Map(candidates.map(src => [src.path, src])).values()];

  if (unique.length === 1) {
    const source = unique[0];
    const owner = usedPaths.get(source.path);
    if (owner && owner !== doc.id) throw new Error(`PDF ${source.path} je přiřazeno dvěma dokumentům: ${owner}, ${doc.id}`);
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
  active_pdf_policy: 'Pouze ministerstva, KPR, státní zastupitelství a Policie ČR; všechny dokumenty zůstávají zveřejněné v chronologii.',
  source_manifests: sourceFiles,
  physical_pdf_count: allPhysicalPdfs.length,
  usable_physical_pdf_count: validPhysicalPdfs.length,
  invalid_physical_pdf_count: allPhysicalPdfs.length - validPhysicalPdfs.length,
  linked_pdf_count: registry.documents.filter(item => item.public?.pdf).length,
  newly_linked_count: changes.length,
  invalidated_link_count: invalidated.length,
  withheld_by_policy_count: withheldByPolicy.length,
  unresolved_count: unresolved.length
};

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
await writeFile('project-memory/pdf-reconciliation-report.json', `${JSON.stringify({
  generated_at: new Date().toISOString(),
  active_pdf_policy: registry.reconciliation.active_pdf_policy,
  physical_pdf_count: allPhysicalPdfs.length,
  usable_physical_pdf_count: validPhysicalPdfs.length,
  invalid_physical_files: allPhysicalPdfs.filter(file => !validity.get(file)),
  source_manifest_pdf_count: sources.length,
  newly_linked: changes,
  invalidated,
  withheld_by_policy: withheldByPolicy,
  unresolved
}, null, 2)}\n`, 'utf8');

console.log(`PDF reconciliation: ${changes.length} nových vazeb, ${registry.reconciliation.linked_pdf_count} aktivních PDF, ${invalidated.length} falešných odkazů odstraněno, ${withheldByPolicy.length} odkazů skryto podle institucionálního pravidla.`);
