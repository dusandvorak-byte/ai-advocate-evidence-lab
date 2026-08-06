import { mkdir, readFile, writeFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const documents = await readJson('project-memory/documents-2026.json');
const institutions = await readJson('project-memory/institutions.json');
const cases = await readJson('project-memory/cases.json');
const deadlines = await readJson('project-memory/deadlines.json');
const architecture = await readJson('project-memory/architecture.json');

const hardErrors = [];
const review = [];

function duplicates(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (!item?.id) {
      hardErrors.push(`${label}: položka bez id`);
      continue;
    }
    if (seen.has(item.id)) hardErrors.push(`${label}: duplicitní id ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

const documentIds = duplicates(documents.documents || [], 'documents');
const institutionIds = duplicates(institutions.institutions || [], 'institutions');
const caseIds = duplicates(cases.cases || [], 'cases');

for (const doc of documents.documents || []) {
  if (doc.institution_id && !institutionIds.has(doc.institution_id)) {
    review.push({ type: 'missing_institution', document_id: doc.id, institution_id: doc.institution_id });
  }
  for (const caseId of doc.case_ids || []) {
    if (!caseIds.has(caseId)) review.push({ type: 'missing_case', document_id: doc.id, case_id: caseId });
  }
  if (doc.public?.pdf && /^\/?web\//.test(String(doc.public.pdf))) {
    hardErrors.push(`documents: veřejná PDF cesta obsahuje zakázaný prefix web/: ${doc.id}`);
  }
}

for (const item of cases.cases || []) {
  if (item.institution_id && !institutionIds.has(item.institution_id)) {
    review.push({ type: 'case_missing_institution', case_id: item.id, institution_id: item.institution_id });
  }
  for (const related of item.related_case_ids || []) {
    if (!caseIds.has(related)) review.push({ type: 'missing_related_case', case_id: item.id, related_case_id: related });
  }
}

for (const deadline of deadlines.deadlines || []) {
  const documentId = deadline.document_id || deadline.source_document_id;
  if (documentId && !documentIds.has(documentId)) {
    review.push({ type: 'deadline_missing_document', deadline_id: deadline.id || null, document_id: documentId });
  }
  if (!deadline.source && !deadline.source_document_id && !deadline.document_id) {
    review.push({ type: 'deadline_missing_provenance', deadline_id: deadline.id || null });
  }
}

if (architecture.single_build_entrypoint !== 'scripts/build-site.mjs') hardErrors.push('architecture: neplatný jediný build');

const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  hard_error_count: hardErrors.length,
  human_review_count: review.length,
  counts: {
    documents: (documents.documents || []).length,
    institutions: (institutions.institutions || []).length,
    cases: (cases.cases || []).length,
    deadlines: (deadlines.deadlines || []).length
  },
  hard_errors: hardErrors,
  human_review_required: review,
  rule: 'Duplicity a neplatné veřejné cesty blokují build. Neúplné vazby se nikdy nedoplňují odhadem a čekají na lidskou kontrolu.'
};

await mkdir('web/data', { recursive: true });
await writeFile('web/data/registry-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (hardErrors.length) throw new Error(`Audit registrů selhal: ${hardErrors.join('; ')}`);
console.log(`Audit registrů: bez tvrdých chyb; ${review.length} vazeb vyžaduje lidskou kontrolu.`);
