import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const source = {
  documents: 'project-memory/documents-2026.json',
  supplement: 'project-memory/documents-2026-supplement-2026-08-10.json',
  institutions: 'project-memory/institutions.json',
  deadlines: 'project-memory/deadlines.json',
  timers: 'project-memory/process-timers.json',
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
await run('scripts/normalize-canonical-data.mjs');
await run('scripts/reconcile-public-pdfs.mjs');
await run('scripts/audit-registries.mjs');

const documentsRegistry = await readJson(source.documents);
const institutionsRegistry = await readJson(source.institutions);
const deadlinesRegistry = await readJson(source.deadlines);
const timersRegistry = await readJson(source.timers);
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
if (!Array.isArray(timersRegistry.timers)) throw new Error('process-timers.json neobsahuje pole timers');
if (axiomsRegistry.status !== 'binding' || !Array.isArray(axiomsRegistry.axioms)) throw new Error('publication-axioms.json není závazný registr');
if (architectureRegistry.single_build_entrypoint !== 'scripts/build-site.mjs') throw new Error('Není použit jediný build Evidence Lab 2.0');
if (goalsRegistry.status !== 'binding') throw new Error('Cíle projektu nejsou závazné');
if (!operationsRegistry.clock?.no_parallel_clock_registry) throw new Error('Časový systém není jednotný');
if (generatorsRegistry.single_public_build_entrypoint !== 'scripts/build-site.mjs') throw new Error('Registr generátorů nemá jediný veřejný build');
if (privacyRegistry.status !== 'binding' || privacyRegistry.alliance_organizations?.length !== 5) throw new Error('Anonymizační výjimky nejsou úplné');
if (registryAudit.hard_error_count !== 0) throw new Error('Audit kanonických registrů obsahuje tvrdé chyby');

await run('scripts/build-dynamic-chronology.mjs');
await run('scripts/sync-public-surfaces.mjs');
await run('scripts/build-deadlines.mjs');
await run('scripts/build-process-timers.mjs');
await run('scripts/build-operational-state.mjs');
await run('scripts/audit-godot-pdf-links.mjs');

const operationalState = await readJson(`${output.data}/operations-state.json`);
const godotPdfAudit = await readJson(`${output.data}/godot-pdf-audit.json`);
for (const key of ['state_and_public_institutions', 'our_submissions', 'unclassified', 'total_documents']) {
  if (!Number.isInteger(operationalState.counters?.[key]) || operationalState.counters[key] < 0) throw new Error(`Neplatné odvozené počítadlo: ${key}`);
}
if (operationalState.counters.total_documents !== documentsRegistry.documents.length) throw new Error('Počítadla nepokrývají celý registr dokumentů');

const expectedStateCount = operationalState.counters.state_and_public_institutions;
const expectedOurCount = operationalState.counters.our_submissions;
const expectedTotalCount = operationalState.counters.total_documents;

let article = await readFile(output.article, 'utf8');
article = article
  .replaceAll('Pavouk český křižák z Branibor již více než 15 let splétá síť na trase Praha–Brno–Praha a zpět. Kdo tu síť rozmotá?', correctTitle)
  .replaceAll('href="web/documents/', 'href="documents/')
  .replaceAll("href='web/documents/", "href='documents/");
await writeFile(output.article, article, 'utf8');
const home = await readFile(output.home, 'utf8');
const liveDockets = await readFile('web/live-dockets.js', 'utf8');
for (const bar of ['Godot online → každá zpráva má zdroj','Aktivní soudní řízení od 1. května 2026','Živé procesní časovače']) if (!liveDockets.includes(bar)) throw new Error(`Generátor titulní stránky neobsahuje lištu: ${bar}`);
for (const obsolete of ['Předžalobní řízení on-line od 1. května 2026','Státní láska online od 1. května 2026']) if (liveDockets.includes(obsolete)) throw new Error(`Generátor obsahuje zrušenou lištu: ${obsolete}`);
if (!home.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Titulní stránka nenačítá kanonický generátor tří lišt');
if (!home.includes('id="procesni-casovace"')) throw new Error('Titulní stránka neobsahuje procesní časovače');
if (!article.includes('id="procesni-casovace"')) throw new Error('Godot neobsahuje procesní časovače');
if (!article.includes(correctTitle)) throw new Error('Článek neobsahuje správný Godotův název');
if (article.includes(wrongTitle)) throw new Error('Článek obsahuje chybný název s křižákem z Branibor');
if (!article.includes('id="chronologie-seznam"')) throw new Error('Článek neobsahuje statickou chronologii');
if (/aktivní originály/i.test(article)) throw new Error('Článek obsahuje samostatný blok aktivních originálů');
if (/href=["']web\/documents\//i.test(article)) throw new Error('Ve veřejném HTML zůstal prefix web/documents/');
const chronologyCount = (article.match(/<li id="doc-[^"]*"/g) || []).length;
if (chronologyCount !== expectedStateCount) throw new Error(`Rozpor chronologie: Godot ${chronologyCount}, státní a veřejné listiny ${expectedStateCount}`);
if (!article.includes(`Stát: ${expectedStateCount} evidovaných listin`)) throw new Error(`Godot neobsahuje odvozený státní počet ${expectedStateCount}`);
if (!home.includes('id="latest-records"')) throw new Error('Titulní stránka neobsahuje synchronizované nejnovější listiny');

await mkdir(output.data, { recursive: true });
await copyFile(source.documents, `${output.data}/documents-2026.json`);
await copyFile(source.institutions, `${output.data}/institutions.json`);
await copyFile(source.deadlines, `${output.data}/deadlines-source.json`);
await copyFile(source.timers, `${output.data}/process-timers-source.json`);
await copyFile(source.axioms, `${output.data}/publication-axioms.json`);
await copyFile('project-memory/pdf-reconciliation-report.json', `${output.data}/pdf-reconciliation-report.json`);
const publicPdfLinks = [...new Set(documentsRegistry.documents.map(item => item.public?.pdf).filter(Boolean).map(publicPath))];
const manifest = {
  schema_version: '2.2', generated_at: new Date().toISOString(), build_entrypoint: 'scripts/build-site.mjs', canonical_sources: source,
  architecture_version: architectureRegistry.schema_version, project_goals_count: goalsRegistry.goals.length,
  registered_subgenerators_count: generatorsRegistry.subgenerators.length, privacy_full_name_person: privacyRegistry.persons[0].name,
  privacy_alliance_organizations_count: privacyRegistry.alliance_organizations.length, operational_state: 'data/operations-state.json',
  registry_audit: 'data/registry-audit.json', pdf_reconciliation_report: 'data/pdf-reconciliation-report.json', godot_pdf_audit: 'data/godot-pdf-audit.json', process_timers: 'data/process-timers.json',
  counts: {
    documents: documentsRegistry.documents.length, institutions: institutionsRegistry.institutions.length, cases: registryAudit.counts.cases,
    deadlines: deadlinesRegistry.deadlines.length, process_timers: timersRegistry.timers.length, chronology_items: chronologyCount, public_pdf_links: publicPdfLinks.length,
    physical_pdf_files: documentsRegistry.reconciliation?.physical_pdf_count ?? null, unresolved_pdf_matches: documentsRegistry.reconciliation?.unresolved_count ?? null,
    eligible_institution_documents: godotPdfAudit.eligible_institution_document_count, eligible_with_active_pdf: godotPdfAudit.eligible_with_active_pdf_count,
    eligible_without_active_pdf: godotPdfAudit.eligible_without_active_pdf_count, broken_godot_pdf_links: godotPdfAudit.broken_article_pdf_link_count,
    registry_hard_errors: registryAudit.hard_error_count, registry_human_review_required: registryAudit.human_review_count,
    state_public_submissions: expectedStateCount, our_submissions: expectedOurCount,
    unclassified_submission_side: operationalState.counters.unclassified, submission_classification_human_review_required: operationalState.classification_quality.human_review_required
  },
  capabilities_preserved: {
    local_and_external_https_document_ingest: true, sha256_identity: true, relevance_with_explanation_and_human_review: true,
    deadline_and_inactivity_tracking: true, live_process_timers: true, single_clock_system: true, two_derived_submission_counters: true,
    counter_values_are_derived_not_manual: true, unclassified_documents_are_not_guessed: true, canonical_registry_audit: true,
    single_public_build_entrypoint: true, five_alliance_privacy_exemptions: true, lawful_third_person_anonymization: true,
    interactive_document_case_law_statute_memory: true, internal_knowledge_not_auto_published: true,
    godot_pdf_links_hard_validated: true, cross_surface_document_count_invariant: true,
    axioms_enforced: axiomsRegistry.axioms.map(item => item.id), goals_enforced: goalsRegistry.goals
  },
  public_pdf_links: publicPdfLinks
};
await writeFile(`${output.data}/build-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Evidence Lab 2.0 build: stát/veřejné instituce ${expectedStateCount}; naše podání ${expectedOurCount}; celkem ${expectedTotalCount}; titulní strana = Godot = manifest; ${publicPdfLinks.length} aktivních PDF; ${timersRegistry.timers.length} živých procesních časovačů.`);
