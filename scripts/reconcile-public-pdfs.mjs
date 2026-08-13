import { access, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const registryPath = 'project-memory/documents-2026.json';
const institutionsPath = 'project-memory/institutions.json';
const policyPath = 'project-memory/active-pdf-policy.json';
const overridesPath = 'project-memory/pdf-link-overrides.json';
const memoryDir = 'project-memory';
const webDir = 'web';
const OUR_FILENAME_MARKERS = /(?:^|[-_])(dvorak|citc|gfaa|ganja-for-all-animals|cannabis-is-the-cure)(?:[-_.]|$)/i;

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
const refTokens = value => norm(value).split(/\s+/).filter(token => token.length >= 2 || /^\d$/.test(token));
const isOurSubmission = doc => doc.submission_side === 'outgoing_from_user_or_alliance';
const isOurNamedFile = file => OUR_FILENAME_MARKERS.test(path.basename(file));

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
const policy = JSON.parse(await readFile(policyPath, 'utf8'));
const overrideRegistry = await exists(overridesPath)
  ? JSON.parse(await readFile(overridesPath, 'utf8'))
  : { overrides: [] };

if (!Array.isArray(registry.documents)) throw new Error('Kanonický registr neobsahuje pole documents');
if (!Array.isArray(institutions.institutions)) throw new Error('Registr institucí neobsahuje pole institutions');
if (policy.status !== 'binding') throw new Error('Politika aktivních PDF není závazná');
if (!Array.isArray(overrideRegistry.overrides)) throw new Error('Registr výjimek PDF neobsahuje pole overrides');

const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));
const requiredInstitutionTypes = new Set(policy.required_institution_types || policy.institution_types || []);
const exemptInstitutionTypes = new Set(policy.exempt_institution_types || []);
const exemptInstitutionIds = new Set(policy.exempt_institution_ids || []);
const exemptDocumentIds = new Set((policy.document_exceptions || []).map(item => item.id));
const requiresPdf = doc => {
  const type = institutionMap.get(doc.institution_id)?.type;
  return !exemptDocumentIds.has(doc.id)
    && !exemptInstitutionIds.has(doc.institution_id)
    && !exemptInstitutionTypes.has(type)
    && requiredInstitutionTypes.has(type);
};
const mayPublishPdf = doc => Boolean(institutionMap.has(doc.institution_id) || isOurSubmission(doc));

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

const documentsById = new Map(registry.documents.map(item => [item.id, item]));
const overrideById = new Map();
const overrideOwnerByPath = new Map();
for (const override of overrideRegistry.overrides) {
  if (!override.document_id || !documentsById.has(override.document_id)) {
    throw new Error(`PDF override odkazuje na neznámý dokument: ${override.document_id}`);
  }
  if (overrideById.has(override.document_id)) throw new Error(`Duplicitní PDF override: ${override.document_id}`);
  overrideById.set(override.document_id, override);
  if (!override.pdf) continue;
  const repoPath = `web/${publicPath(override.pdf)}`;
  if (!validPhysicalSet.has(repoPath)) throw new Error(`PDF override není použitelný: ${repoPath}`);
  const prior = overrideOwnerByPath.get(repoPath);
  if (prior && prior !== override.document_id) throw new Error(`PDF override má dva vlastníky: ${repoPath}`);
  overrideOwnerByPath.set(repoPath, override.document_id);
}

const declaredOwners = new Map();
for (const src of sources) {
  const sourceRef = compact(src.reference);
  if (!sourceRef) continue;
  const matches = registry.documents.filter(doc => {
    if (compact(doc.reference) !== sourceRef) return false;
    if (src.date && doc.issue_date && src.date !== doc.issue_date) return false;
    if (src.institution_id && doc.institution_id !== src.institution_id) return false;
    return true;
  });
  if (matches.length === 1) declaredOwners.set(src.path, matches[0].id);
}

const usedPaths = new Map();
const changes = [];
const overrideChanges = [];
const unresolved = [];
const invalidated = [];
const unmatchedPublishable = [];

// Závazný override se uplatní dřív než historické explicitní odkazy v registru.
for (const doc of registry.documents) {
  doc.public ||= {};
  const override = overrideById.get(doc.id);
  if (!override) continue;

  if (!override.pdf) {
    if (doc.public.pdf) {
      overrideChanges.push({ id: doc.id, previous_pdf: doc.public.pdf, pdf: null, reason: override.reason || null });
    }
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'catalogued_pdf_override_none';
    doc.public.source_manifest = overridesPath;
    continue;
  }

  const normalized = publicPath(override.pdf);
  const repoPath = `web/${normalized}`;
  const oldPdf = doc.public.pdf || null;
  doc.public.pdf = normalized;
  doc.public.verification_status = 'published';
  doc.public.source_manifest = overridesPath;
  usedPaths.set(repoPath, doc.id);
  if (oldPdf !== normalized) overrideChanges.push({ id: doc.id, previous_pdf: oldPdf, pdf: normalized, reason: override.reason || null });
}

// Platné explicitní odkazy se zachovají, ale nesmějí porušit vlastnictví override,
// manifestu nebo axiom, že uživatelsky pojmenovaný soubor není státní originál.
for (const doc of registry.documents) {
  if (!doc.public?.pdf) continue;
  const repoPath = `web/${publicPath(doc.public.pdf)}`;
  const overrideOwner = overrideOwnerByPath.get(repoPath);
  if (overrideOwner && overrideOwner !== doc.id) {
    invalidated.push({ id: doc.id, invalid_pdf: doc.public.pdf, reason: `override-owned-by:${overrideOwner}` });
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'wrong_public_file_rejected';
    continue;
  }
  if (!validPhysicalSet.has(repoPath)) {
    invalidated.push({ id: doc.id, invalid_pdf: doc.public.pdf, reason: 'invalid-public-pdf' });
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'invalid_public_file';
    continue;
  }
  if (!isOurSubmission(doc) && isOurNamedFile(repoPath)) {
    invalidated.push({ id: doc.id, invalid_pdf: doc.public.pdf, reason: 'state-document-cannot-own-user-named-pdf' });
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'wrong_public_file_rejected';
    continue;
  }
  const declaredOwner = declaredOwners.get(repoPath);
  if (declaredOwner && declaredOwner !== doc.id) {
    invalidated.push({ id: doc.id, invalid_pdf: doc.public.pdf, reason: `manifest-owned-by:${declaredOwner}` });
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'wrong_public_file_rejected';
    continue;
  }
  const prior = usedPaths.get(repoPath);
  if (prior && prior !== doc.id) {
    invalidated.push({ id: doc.id, invalid_pdf: doc.public.pdf, reason: `duplicate-public-pdf-owned-by:${prior}` });
    doc.public.pdf = null;
    doc.public.sha256 = null;
    doc.public.verification_status = 'duplicate_public_file_rejected';
    continue;
  }
  usedPaths.set(repoPath, doc.id);
  doc.public.verification_status = 'published';
}

function fileEligibleForDocument(doc, file) {
  if (!isOurSubmission(doc) && isOurNamedFile(file)) return false;
  const overrideOwner = overrideOwnerByPath.get(file);
  if (overrideOwner && overrideOwner !== doc.id) return false;
  const reserved = usedPaths.get(file);
  if (reserved && reserved !== doc.id) return false;
  return true;
}

function scorePhysicalCandidate(doc, file) {
  if (!fileEligibleForDocument(doc, file)) return { score: -999, reasons: ['ownership-policy-rejected'] };
  const filename = norm(path.basename(file));
  const filenameTokens = new Set(filename.split(/\s+/).filter(Boolean));
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
    const matched = tokens.filter(token => filenameTokens.has(token));
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
  if (year && filenameTokens.has(year)) {
    score += 8;
    reasons.push('year');
  }
  if (year && month && day) {
    const variants = [
      `${year}-${month}-${day}`,
      `${day}-${month}-${year}`,
      `${day}.${month}.${year}`,
      `${Number(day)}-${Number(month)}-${year}`,
      `${Number(day)}.${Number(month)}.${year}`
    ].map(norm);
    if (variants.some(value => value && filename.includes(value))) {
      score += 18;
      reasons.push('full-date');
    }
  }
  const aliasHits = [...new Set(aliases.filter(token => token.length >= 3 && filenameTokens.has(token)))];
  if (aliasHits.length) {
    score += Math.min(12, aliasHits.length * 3);
    reasons.push('institution');
  }
  return { score, reasons };
}

for (const doc of registry.documents) {
  doc.public ||= {};
  if (doc.public.pdf || !mayPublishPdf(doc)) continue;
  if (overrideById.has(doc.id)) continue;

  const ref = compact(doc.reference);
  const date = doc.issue_date;
  let candidates = sources.filter(src => {
    const sameDate = !src.date || !date || src.date === date;
    const sameInstitution = !src.institution_id || src.institution_id === doc.institution_id;
    const sourceRef = compact(src.reference);
    return sameDate && sameInstitution && ref && sourceRef && sourceRef === ref;
  });
  candidates = candidates.filter(src => validPhysicalSet.has(src.path) && fileEligibleForDocument(doc, src.path));
  let unique = [...new Map(candidates.map(src => [src.path, src])).values()];

  if (!unique.length) {
    const scored = validPhysicalPdfs
      .filter(file => fileEligibleForDocument(doc, file))
      .filter(file => !declaredOwners.has(file) || declaredOwners.get(file) === doc.id)
      .map(file => ({ path: file, ...scorePhysicalCandidate(doc, file) }))
      .filter(item => item.score >= 80)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    if (scored.length && (scored.length === 1 || scored[0].score >= scored[1].score + 20)) {
      unique = [scored[0]];
    } else if (scored.length) {
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
    unresolved.push({ id: doc.id, reference: doc.reference, reason: 'ambiguous-manifest-match', candidates: unique.map(item => item.path) });
  } else {
    unmatchedPublishable.push({ id: doc.id, institution_id: doc.institution_id, reference: doc.reference, issue_date: doc.issue_date });
  }
}

const requiredDocuments = registry.documents.filter(requiresPdf);
const requiredWithoutPdf = requiredDocuments.filter(item => !item.public?.pdf);
const linkedPdfCount = registry.documents.filter(item => item.public?.pdf).length;

registry.reconciliation = {
  updated_at: new Date().toISOString(),
  active_pdf_policy: policy.principle,
  active_pdf_policy_file: policyPath,
  ownership_axiom: 'user-named-pdf-never-state-original',
  source_manifests: sourceFiles,
  override_registry: overridesPath,
  physical_pdf_count: allPhysicalPdfs.length,
  usable_physical_pdf_count: validPhysicalPdfs.length,
  invalid_physical_pdf_count: allPhysicalPdfs.length - validPhysicalPdfs.length,
  linked_pdf_count: linkedPdfCount,
  newly_linked_count: changes.length,
  override_change_count: overrideChanges.length,
  invalidated_link_count: invalidated.length,
  unresolved_count: unresolved.length,
  unmatched_publishable_count: unmatchedPublishable.length,
  required_pdf_document_count: requiredDocuments.length,
  required_without_active_pdf_count: requiredWithoutPdf.length
};

const report = {
  generated_at: new Date().toISOString(),
  active_pdf_policy: policy.principle,
  active_pdf_policy_file: policyPath,
  ownership_axiom: registry.reconciliation.ownership_axiom,
  override_registry: overridesPath,
  physical_pdf_count: allPhysicalPdfs.length,
  usable_physical_pdf_count: validPhysicalPdfs.length,
  invalid_physical_files: allPhysicalPdfs.filter(file => !validity.get(file)),
  source_manifest_pdf_count: sources.length,
  linked_pdf_count: linkedPdfCount,
  newly_linked: changes,
  override_changes: overrideChanges,
  invalidated,
  unresolved,
  required_pdf_document_count: requiredDocuments.length,
  required_without_active_pdf_count: requiredWithoutPdf.length,
  required_without_active_pdf: requiredWithoutPdf.map(item => ({
    id: item.id,
    institution_id: item.institution_id,
    reference: item.reference,
    issue_date: item.issue_date,
    intended_pdf: item.public?.intended_pdf || null
  })),
  unmatched_publishable: unmatchedPublishable,
  unlinked_usable_physical_pdfs: validPhysicalPdfs.filter(file => !usedPaths.has(file))
};

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
await writeFile('project-memory/pdf-reconciliation-report.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`PDF reconciliation: ${changes.length} automatických vazeb, ${overrideChanges.length} override změn, ${linkedPdfCount} aktivních PDF; povinný rozsah ${requiredDocuments.length}, bez PDF ${requiredWithoutPdf.length}.`);
