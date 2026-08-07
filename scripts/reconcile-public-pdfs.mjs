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
const dateParts = value => String(value || '').split('-').filter(Boolean);
const refTokens = value => norm(value).split(/\s+/).filter(token => token.length >= 2);

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
const unmatchedEligible = [];

function scorePhysicalCandidate(doc, file) {
  const filename = norm(path.basename(file));
  const filenameCompact = compact(path.basename(file));
  const ref = compact(doc.reference);
  const tokens = refTokens(doc.reference);
  const inst = institutionMap.get(doc.institution_id) || {};
  const aliases = [doc.institution_id, inst.short_name, inst.name, inst.name_cs].filter(Boolean).flatMap(refTokens);
  let score = 0;
  const reasons = [];

  if (ref && filenameCompact.includes(ref)) {
    score += 120;
    reasons.push('full-reference');
  } else if (tokens.length) {
    const matched = tokens.filter(token => filename.includes(token));
    const ratio = matched.length / tokens.length;
    if (ratio === 1) {
      score += 90;
      reasons.push('all-reference-tokens');
    } else if (ratio >= 0.75 && matched.length >= 3) {
      score += 65;
      reasons.push('most-reference-tokens');
    } else if (ratio >= 0.5 && matched.length >= 3) {
      score += 40;
      reasons.push('half-reference-tokens');
    }
  }

  const [year, month, day] = dateParts(doc.issue_date);
  if (year && filename.includes(year)) {
    score += 8;
    reasons.push('year');
  }
  if (year && month && day) {
    const dateVariants = [
      `${year}-${month}-${day}`,
      `${day}-${month}-${year}`,
      `${day}.${month}.${year}`,
      `${Number(day)}-${Number(month)}-${year}`,
      `${Number(day)}.${Number(month)}.${year}`
    ].map(norm);
    if (dateVariants.some(value => value && filename.includes(value))) {
      score += 18;
      reasons.push('full-date');
    }
  }

  const aliasHits = [...new Set(aliases.filter(token => token.length >= 3 && filename.includes(token)))];
  if (aliasHits.length) {
    score += Math.min(12, aliasHits.length * 3);
    reasons.push('institution');
  }
  return { score, reasons };
}

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

  candidates = candidates.filter(src => validPhysicalSet.has(src.path));
  let unique = [...new Map(candidates.map(src => [src.path, src])).values()];

  if (!unique.length) {
    const scored = validPhysicalPdfs
      .filter(file => !usedPaths.has(file))
      .map(file => ({ path: file, ...scorePhysicalCandidate(doc, file) }))
      .filter(item => item.score >= 80)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    if (scored.length && (scored.length === 1 || scored[0].score >= scored[1].score + 20)) unique = [scored[0]];
    else if (scored.length) {
      unresolved.push({ id: doc.id, reference: doc.reference, reason: 'ambiguous-scored-match', candidates: scored.slice(0, 5) });
      continue;
    }
  }

  if (unique.length === 1) {
    const source = unique[0];
    const owner = usedPaths.get(source.path);
    if (owner && owner !== doc.id) throw new Error(`PDF ${source.path} je přiřazeno dvěma dokumentům: ${owner}, ${doc.id}`);
    doc.public.pdf = publicPath(source.path);
    if (source.sha256) doc.public.sha256 = source.sha256;
    doc.public.verification_status = 'published';
    doc.public.source_manifest = source.source_manifest || 'filename-reference-date-reconciliation';
    usedPaths.set(source.path, doc.id);
    changes.push({ id: doc.id, reference: doc.reference, pdf: doc.public.pdf, score: source.score ?? null, reasons: source.reasons ?? [] });
  } else if (unique.length > 1) {
    unresolved.push({ id: doc.id, reference: doc.reference, reason: 'ambiguous-manifest-match', candidates: unique.map(x => x.path) });
  } else {
    unmatchedEligible.push({ id: doc.id, institution_id: doc.institution_id, reference: doc.reference, issue_date: doc.issue_date });
  }
}

registry.reconciliation = {
  updated_at: new Date().toISOString(),
  active_pdf_policy: 'Ministerstva, KPR, státní zastupitelství a Policie ČR mají aktivní odkaz vždy, pokud je jejich originální PDF fyzicky přítomné a jednoznačně přiřaditelné; všechny dokumenty zůstávají zveřejněné v chronologii.',
  source_manifests: sourceFiles,
  physical_pdf_count: allPhysicalPdfs.length,
  usable_physical_pdf_count: validPhysicalPdfs.length,
  invalid_physical_pdf_count: allPhysicalPdfs.length - validPhysicalPdfs.length,
  linked_pdf_count: registry.documents.filter(item => item.public?.pdf).length,
  newly_linked_count: changes.length,
  invalidated_link_count: invalidated.length,
  withheld_by_policy_count: withheldByPolicy.length,
  unresolved_count: unresolved.length,
  unmatched_eligible_count: unmatchedEligible.length
};

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
await writeFile('project-memory/pdf-reconciliation-report.json', `${JSON.stringify({
  generated_at: new Date().toISOString(),
  active_pdf_policy: registry.reconciliation.active_pdf_policy,
  physical_pdf_count: allPhysicalPdfs.length,
  usable_physical_pdf_count: validPhysicalPdfs.length,
  invalid_physical_files: allPhysicalPdfs.filter(file => !validity.get(file)),
  source_manifest_pdf_count: sources.length,
  linked_pdf_count: registry.reconciliation.linked_pdf_count,
  newly_linked: changes,
  invalidated,
  withheld_by_policy: withheldByPolicy,
  unresolved,
  unmatched_eligible: unmatchedEligible,
  unlinked_usable_physical_pdfs: validPhysicalPdfs.filter(file => !usedPaths.has(file))
}, null, 2)}\n`, 'utf8');

console.log(`PDF reconciliation: ${changes.length} nových vazeb, ${registry.reconciliation.linked_pdf_count} aktivních PDF, ${invalidated.length} falešných odkazů odstraněno, ${withheldByPolicy.length} odkazů skryto podle institucionálního pravidla, ${unmatchedEligible.length} oprávněných listin bez jednoznačné fyzické shody.`);
