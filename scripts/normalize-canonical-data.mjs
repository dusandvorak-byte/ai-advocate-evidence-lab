import { readFile, writeFile } from 'node:fs/promises';

const documentsPath = 'project-memory/documents-2026.json';
const supplementPath = 'project-memory/documents-2026-supplement-2026-08-10.json';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const registry = await readJson(documentsPath);
const supplement = await readJson(supplementPath);
if (!Array.isArray(registry.documents)) throw new Error('documents-2026.json neobsahuje pole documents');
if (!Array.isArray(supplement.documents)) throw new Error('documents-2026-supplement-2026-08-10.json neobsahuje pole documents');

// Jediná kanonická pracovní množina pro celý build: základní registr + dávka 10. 8. 2026.
// Stabilní ID zajišťuje idempotenci: opakovaný build nikdy nevytvoří duplicitní položku.
const merged = new Map(registry.documents.map(doc => [doc.id, doc]));
for (const doc of supplement.documents) merged.set(doc.id, { ...(merged.get(doc.id) || {}), ...doc });
registry.documents = [...merged.values()];
registry.canonical_supplements = [supplementPath];

const eudaAckId = 'doc-eu-euda-2026-08-07-ack-article-265-tfeu';
if (!registry.documents.some(doc => doc.id === eudaAckId)) {
  registry.documents.push({
    id: eudaAckId,
    user_title: 'Potvrzení přijetí formální výzvy k jednání podle čl. 265 SFEU a příslib následné odpovědi',
    issue_date: '2026-08-07',
    received_date: '2026-08-07',
    institution_id: 'EU-EUDA',
    reference: 'bez samostatného č. j./sp. zn. v e-mailu',
    case_ids: [],
    document_type: 'state_record',
    topics: ['EUDA', 'čl. 265 SFEU', 'THC', 'THCA', 'analytické metody'],
    public: {
      html: 'listiny/euda-2026-08-07-potvrzeni-prijeti-cl-265-sfeu.html',
      pdf: null,
      sha256: null,
      verification_status: 'catalogued'
    },
    relations: [{ type: 'souvisí', target_id: 'zpravy/07082026-011.html' }],
    evidence_note: 'EUDA dne 7. 8. 2026 v 17:06:35 potvrdila přijetí korespondence k formální výzvě podle čl. 265 SFEU; e-mail neobsahuje samostatné č. j. ani sp. zn.'
  });
}

const outgoingTypes = new Set(['user_submission', 'user_filing', 'alliance_submission', 'our_submission', 'user_submission_attachment']);
const institutionAliases = new Map([
  ['CZ-OSZ-PRO', 'CZ-OSZ-PV'],
  ['CZ-PCR-KRPM', 'CZ-PCR-KRPO']
]);
let changed = 0;
let incoming = 0;
let outgoing = 0;
let unclassified = 0;
let filledUserTitles = 0;

for (const doc of registry.documents) {
  if (institutionAliases.has(doc.institution_id)) {
    doc.institution_id = institutionAliases.get(doc.institution_id);
    changed += 1;
  }
  if (!Array.isArray(doc.case_ids)) { doc.case_ids = []; changed += 1; }
  if (!Array.isArray(doc.topics)) { doc.topics = []; changed += 1; }
  if (!Array.isArray(doc.relations)) { doc.relations = []; changed += 1; }
  if (!doc.public || typeof doc.public !== 'object') { doc.public = { html: null, pdf: null, sha256: null, verification_status: 'catalogued' }; changed += 1; }

  if (!String(doc.user_title || '').trim()) {
    const deterministicTitle = String(doc.title || '').trim();
    if (deterministicTitle) {
      doc.user_title = deterministicTitle;
      doc.user_title_basis = 'deterministic_copy_from_existing_title';
      changed += 1;
      filledUserTitles += 1;
    }
  }

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
  rule: 'Kanonická data se doplňují pouze deterministicky. Základní registr a schválené dávkové doplňky se slučují podle stabilního ID; starší aliasy institucí se převádějí na kanonická ID; state_record = příchozí stát/veřejná instituce; výslovné typy našich podání = odchozí; ostatní bez odhadu.',
  institution_aliases: Object.fromEntries(institutionAliases),
  canonical_supplement_documents: supplement.documents.length,
  filled_user_titles_from_existing_title: filledUserTitles,
  incoming_from_state_or_public_institution: incoming,
  outgoing_from_user_or_alliance: outgoing,
  unclassified: unclassified
};

await writeFile(documentsPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
console.log(`Normalizace kanonických dat: základ + ${supplement.documents.length} položek dávky; stát/veřejné instituce ${incoming}; naše podání ${outgoing}; nezařazené ${unclassified}; celkem ${registry.documents.length}.`);
