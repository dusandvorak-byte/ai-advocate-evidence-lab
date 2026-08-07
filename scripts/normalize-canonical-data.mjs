import { readFile, writeFile } from 'node:fs/promises';

const documentsPath = 'project-memory/documents-2026.json';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const registry = await readJson(documentsPath);
if (!Array.isArray(registry.documents)) throw new Error('documents-2026.json neobsahuje pole documents');

const outgoingTypes = new Set(['user_submission', 'user_filing', 'alliance_submission', 'our_submission']);
let changed = 0;
let incoming = 0;
let outgoing = 0;
let unclassified = 0;

for (const doc of registry.documents) {
  if (!Array.isArray(doc.case_ids)) { doc.case_ids = []; changed += 1; }
  if (!Array.isArray(doc.topics)) { doc.topics = []; changed += 1; }
  if (!Array.isArray(doc.relations)) { doc.relations = []; changed += 1; }
  if (!doc.public || typeof doc.public !== 'object') { doc.public = { html: null, pdf: null, sha256: null, verification_status: 'catalogued' }; changed += 1; }

  let safeSide = null;
  if (doc.document_type === 'state_record') safeSide = 'incoming_from_state_or_public_institution';
  else if (outgoingTypes.has(doc.document_type)) safeSide = 'outgoing_from_user_or_alliance';

  if (safeSide && doc.submission_side !== safeSide) {
    doc.submission_side = safeSide;
    doc.submission_side_basis = 'deterministic_document_type';
    changed += 1;
  }

  if (doc.submission_side === 'incoming_from_state_or_public_institution') incoming += 1;
  else if (doc.submission_side === 'outgoing_from_user_or_alliance') outgoing += 1;
  else unclassified += 1;
}

registry.normalization = {
  updated_at: new Date().toISOString(),
  rule: 'Kanonická data se doplňují pouze deterministicky. State_record = příchozí stát/veřejná instituce; výslovné typy našich podání = odchozí; ostatní bez odhadu.',
  incoming_from_state_or_public_institution: incoming,
  outgoing_from_user_or_alliance: outgoing,
  unclassified: unclassified
};

await writeFile(documentsPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
console.log(`Normalizace kanonických dat: ${changed} změn; stát/veřejné instituce ${incoming}; naše podání ${outgoing}; nezařazené ${unclassified}.`);
