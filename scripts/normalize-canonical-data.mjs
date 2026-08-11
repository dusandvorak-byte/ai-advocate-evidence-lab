import { readFile, writeFile } from 'node:fs/promises';

const documentsPath = 'project-memory/documents-2026.json';
const sourcesPath = 'project-memory/document-sources.json';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

const sourceManifest = await readJson(sourcesPath);
if (sourceManifest.status !== 'binding' || !Array.isArray(sourceManifest.sources) || !sourceManifest.sources.length) {
  throw new Error('document-sources.json není platný závazný manifest zdrojů');
}

const sourceRegistries = [];
for (const source of sourceManifest.sources) {
  if (!source?.path) throw new Error('Zdroj dokumentů bez path');
  const data = await readJson(source.path);
  if (!Array.isArray(data.documents)) throw new Error(`${source.path} neobsahuje pole documents`);
  sourceRegistries.push({ source, data });
}

const base = sourceRegistries.find(item => item.source.role === 'base') || sourceRegistries[0];
const registry = base.data;
const merged = new Map();
for (const { source, data } of sourceRegistries) {
  for (const doc of data.documents) {
    if (!doc?.id) throw new Error(`Dokument bez stabilního ID ve zdroji ${source.path}`);
    const previous = merged.get(doc.id) || {};
    merged.set(doc.id, { ...previous, ...doc });
  }
}
registry.documents = [...merged.values()];
registry.canonical_sources_manifest = sourcesPath;
registry.canonical_sources = sourceManifest.sources.map(item => item.path);

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
  rule: 'Kanonická pracovní množina vzniká výhradně z document-sources.json. Všechny zdroje se slučují podle stabilního ID; veřejné výstupy a čítače nesmějí udržovat vlastní paralelní seznam dokumentů.',
  source_manifest: sourcesPath,
  source_count: sourceManifest.sources.length,
  source_documents_before_deduplication: sourceRegistries.reduce((sum, item) => sum + item.data.documents.length, 0),
  merged_document_count: registry.documents.length,
  institution_aliases: Object.fromEntries(institutionAliases),
  filled_user_titles_from_existing_title: filledUserTitles,
  incoming_from_state_or_public_institution: incoming,
  outgoing_from_user_or_alliance: outgoing,
  unclassified
};

await writeFile(documentsPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
console.log(`Normalizace kanonických dat: ${sourceManifest.sources.length} zdroje přes ${sourcesPath}; stát/veřejné instituce ${incoming}; naše podání ${outgoing}; nezařazené ${unclassified}; celkem ${registry.documents.length}.`);
