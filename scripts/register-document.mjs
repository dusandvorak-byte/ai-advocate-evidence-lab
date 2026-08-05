import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error('Použití: node scripts/register-document.mjs cesta/k/dokumentu.json');
  process.exit(2);
}

const registryPath = 'project-memory/documents-2026.json';
const institutionsPath = 'project-memory/institutions.json';
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const institutions = JSON.parse(await readFile(institutionsPath, 'utf8'));
const incoming = JSON.parse(await readFile(inputPath, 'utf8'));

const institutionEntries = Array.isArray(institutions.institutions)
  ? institutions.institutions
  : Object.values(institutions.institutions || {});
const institutionIds = new Set(institutionEntries.map(item => item.id));

const slug = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const requireField = field => {
  if (!incoming[field]) throw new Error(`Chybí povinné pole ${field} v ${basename(inputPath)}`);
};
for (const field of ['issue_date', 'institution_id', 'reference', 'user_title']) requireField(field);
if (!institutionIds.has(incoming.institution_id)) {
  throw new Error(`Neznámá instituce ${incoming.institution_id}; nejprve ji přidejte do institutions.json`);
}

const generatedId = `doc-${slug(incoming.institution_id)}-${incoming.issue_date}-${slug(incoming.reference)}`;
const documentItem = {
  id: incoming.id || generatedId,
  user_title: incoming.user_title,
  issue_date: incoming.issue_date,
  received_date: incoming.received_date || null,
  institution_id: incoming.institution_id,
  reference: incoming.reference,
  case_ids: Array.isArray(incoming.case_ids) ? incoming.case_ids : [],
  document_type: incoming.document_type || 'state_record',
  direction: incoming.direction || 'incoming',
  source_origin: incoming.source_origin || 'internal_upload',
  topics: Array.isArray(incoming.topics) ? incoming.topics : [],
  public: {
    html: incoming.public?.html || null,
    pdf: incoming.public?.pdf || null,
    sha256: incoming.public?.sha256 || null,
    verification_status: incoming.public?.verification_status || 'catalogued'
  },
  relations: Array.isArray(incoming.relations) ? incoming.relations : []
};

if (registry.documents.some(item => item.id === documentItem.id)) {
  throw new Error(`Dokument se stabilním ID ${documentItem.id} již existuje`);
}

registry.documents.push(documentItem);
registry.documents.sort((a, b) => {
  const issue = String(a.issue_date || '').localeCompare(String(b.issue_date || ''));
  if (issue) return issue;
  const received = String(a.received_date || '').localeCompare(String(b.received_date || ''));
  if (received) return received;
  return String(a.id || '').localeCompare(String(b.id || ''));
});

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
console.log(`Zařazen dokument ${documentItem.id}; chronologie nyní obsahuje ${registry.documents.length} dokumentů.`);
