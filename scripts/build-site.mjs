import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const source = {
  documents: 'project-memory/documents-2026.json',
  institutions: 'project-memory/institutions.json',
  deadlines: 'project-memory/deadlines.json',
  axioms: 'project-memory/publication-axioms.json',
  architecture: 'project-memory/architecture.json',
  goals: 'project-memory/project-goals.json',
  operations: 'project-memory/operations-ledger.json',
  generators: 'project-memory/generators.json',
  privacy: 'project-memory/privacy-exempt-entities.json'
};
const output = { article: 'web/zpravy/04082026-010.html', home: 'web/index.html', data: 'web/data' };
const correctTitle = 'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?';
const wrongTitle = 'Pavouk český křižák z Branibor';
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const run = script => new Promise((resolve, reject) => {
  const child = spawn(globalThis.process.execPath, [script], { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} skončil kódem ${code}`)));
});
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');

await run('scripts/validate-architecture.mjs');
// Nejprve deterministicky vyčistit a sjednotit PDF vazby; teprve potom auditovat
// kanonický registr. Audit tak neblokuje opravu starých normalizovatelných cest.
await run('scripts/reconcile-public-pdfs.mjs');
await run('scripts/audit-registries.mjs');

const documentsRegistry = await readJson(source.documents);
const institutionsRegistry = await readJson(source.institutions);
const deadlinesRegistry = await readJson(source.deadlines);
const axiomsRegistry = await readJson(source.axioms);
const architectureRegistry = await readJson(source.architecture);
const goalsRegistry = await readJson(source.goals);
const operationsRegistry = await readJson(source.operations);
const generatorsRegistry = await readJson(source.generators);
const privacyRegistry = await readJson(source.privacy);
const registryAudit = await readJson(`${output.data}/registry-audit.json`);
if (!Array.isArray(documentsRegistry.documents)) throw new Error('documents-2026.json neobsahuje pole documents');
if (!Array.isArray(institutionsRegistry.institutions)) throw new Error('institutions.json neobsahuje pole institutions');
if (!Array.isArray(deadlinesRegistry.deadlines)) throw new Error('deadlines.json neobsahuje pole deadlines');
if (axiomsRegistry.status !== 'binding' || !Array.isArray(axiomsRegistry.axioms)) throw new Error('publication-axioms.json není závazný registr');
if (architectureRegistry.single_build_entrypoint !== 'scripts/build-site.mjs') throw new Error('Není použit jediný build Evidence Lab 2.0');
if (goalsRegistry.status !== 'binding') throw new Error('Cíle projektu nejsou závazné');
if (!operationsRegistry.clock?.no_parallel_clock_registry) throw new Error('Časový systém není jednotný');
if (generatorsRegistry.single_public_build_entrypoint !== 'scripts/build-site.mjs') throw new Error('Registr generátorů nemá jediný veřejný build');
if (privacyRegistry.status !== 'binding' || privacyRegistry.alliance_organizations?.length !== 5) throw new Error('Anonymizační výjimky nejsou úplné');
if (registryAudit.hard_error_count !== 0) throw new Error('Audit kanonických registrů obsahuje tvrdé chyby');

await run('scripts/build-dynamic-chronology.mjs');
await run('scripts/finalize-homepage.mjs');
await run('scripts/build-deadlines.mjs');
await run('scripts/build-operational-state.mjs');

const operationalState = await readJson(`${output.data}/operations-state.json`);
for (const key of ['state_and_public_institutions', 'our_submissions', 'unclassified', 'total_documents']) {
  if (!Number.isInteger(operationalState.counters?.[key]) || operationalState.counters[key] < 0) throw new Error(`Neplatné odvozené počítadlo: ${key}`);
}
if (operationalState.counters.total_documents !== documentsRegistry.documents.length) throw new Error('Počítadla nepokrývají celý registr dokumentů');

let article = await readFile(output.article, 'utf8');
article = article
  .replaceAll('Pavouk český křižák z Branibor již více než 15 let splétá síť na trase Praha–Brno–Praha a zpět. Kdo tu síť rozmotá?', correctTitle)
  .replaceAll('href="web/documents/', 'href="documents/')
  .replaceAll("href='web/documents/", "href='documents/");
await writeFile(output.article, article, 'utf8');
const home = await readFile(output.home, 'utf8');
for (const bar of ['Aktivní soudní řízení on-line od 1. května 2026','Předžalobní řízení on-line od 1. května 2026','Státní láska online od 1. května 2026']) if (!home.includes(bar)) throw new Error(`Na titulní stránce chybí lišta: ${bar}`);
if (!article.includes(correctTitle)) throw new Error('Článek neobsahuje správný Godotův název');
if (article.includes(wrongTitle)) throw new Error('Článek obsahuje chybný název s křižákem z Branibor');
if (!article.includes('id="chronologie-seznam"')) throw new Error('Článek neobsahuje statickou chronologii');
if (/aktivní originály/i.test(article)) throw new Error('Článek obsahuje samostatný blok aktivních originálů');
if (/href=["']web\/documents\//i.test(article)) throw new Error('Ve veřejném HTML zůstal prefix web/documents/');
const chronologyCount = (article.match(/<li id="doc-[^"]*"/g) || []).length;
if (chronologyCount < 1) throw new Error('Chronologie je prázdná');

await mkdir(output.data, { recursive: true });
await copyFile(source.documents, `${output.data}/documents-2026.json`);
await copyFile(source.institutions, `${output.data}/institutions.json`);
await copyFile(source.deadlines, `${output.data}/deadlines-source.json`);
await copyFile(source.axioms, `${output.data}/publication-axioms.json`);
await copyFile('project-memory/pdf-reconciliation-report.json', `${output.data}/pdf-reconciliation-report.json`);
const publicPdfLinks = [...new Set(documentsRegistry.documents.map(item => item.public?.pdf).filter(Boolean).map(publicPath))];
const manifest = {
  schema_version: '2.2', generated_at: new Date().toISOString(), build_entrypoint: 'scripts/build-site.mjs', canonical_sources: source,
  architecture_version: architectureRegistry.schema_version, project_goals_count: goalsRegistry.goals.length,
  registered_subgenerators_count: generatorsRegistry.subgenerators.length, privacy_full_name_person: privacyRegistry.persons[0].name,
  privacy_alliance_organizations_count: privacyRegistry.alliance_organizations.length, operational_state: 'data/operations-state.json',
  registry_audit: 'data/registry-audit.json', pdf_reconciliation_report: 'data/pdf-reconciliation-report.json',
  counts: {
    documents: documentsRegistry.documents.length, institutions: institutionsRegistry.institutions.length, cases: registryAudit.counts.cases,
    deadlines: deadlinesRegistry.deadlines.length, chronology_items: chronologyCount, public_pdf_links: publicPdfLinks.length,
    physical_pdf_files: documentsRegistry.reconciliation?.physical_pdf_count ?? null, unresolved_pdf_matches: documentsRegistry.reconciliation?.unresolved_count ?? null,
    registry_hard_errors: registryAudit.hard_error_count, registry_human_review_required: registryAudit.human_review_count,
    state_public_submissions: operationalState.counters.state_and_public_institutions, our_submissions: operationalState.counters.our_submissions,
    unclassified_submission_side: operationalState.counters.unclassified, submission_classification_human_review_required: operationalState.classification_quality.human_review_required
  },
  capabilities_preserved: {
    local_and_external_https_document_ingest: true, sha256_identity: true, relevance_with_explanation_and_human_review: true,
    deadline_and_inactivity_tracking: true, single_clock_system: true, two_derived_submission_counters: true,
    counter_values_are_derived_not_manual: true, unclassified_documents_are_not_guessed: true, canonical_registry_audit: true,
    single_public_build_entrypoint: true, five_alliance_privacy_exemptions: true, lawful_third_person_anonymization: true,
    interactive_document_case_law_statute_memory: true, internal_knowledge_not_auto_published: true,
    axioms_enforced: axiomsRegistry.axioms.map(item => item.id), goals_enforced: goalsRegistry.goals
  },
  public_pdf_links: publicPdfLinks
};
await writeFile(`${output.data}/build-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Evidence Lab 2.0 build: audit 0 tvrdých chyb / ${registryAudit.human_review_count} vazeb ke kontrole; stát/veřejné instituce ${operationalState.counters.state_and_public_institutions}; naše podání ${operationalState.counters.our_submissions}; nezařazené ${operationalState.counters.unclassified}; ${publicPdfLinks.length} aktivních PDF.`);
