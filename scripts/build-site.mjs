import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const source = {
  documents: 'project-memory/documents-2026.json',
  institutions: 'project-memory/institutions.json',
  deadlines: 'project-memory/deadlines.json',
  axioms: 'project-memory/publication-axioms.json'
};
const output = {
  article: 'web/zpravy/04082026-010.html',
  home: 'web/index.html',
  data: 'web/data'
};
const correctTitle = 'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?';
const wrongTitle = 'Pavouk český křižák z Branibor';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = async path => access(path).then(() => true).catch(() => false);
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^web\//, '');
const run = script => new Promise((resolve, reject) => {
  const process = spawn(globalThis.process.execPath, [script], { stdio: 'inherit' });
  process.on('error', reject);
  process.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} skončil kódem ${code}`)));
});

const documentsRegistry = await readJson(source.documents);
const institutionsRegistry = await readJson(source.institutions);
const deadlinesRegistry = await readJson(source.deadlines);
const axiomsRegistry = await readJson(source.axioms);

if (!Array.isArray(documentsRegistry.documents)) throw new Error('documents-2026.json neobsahuje pole documents');
if (!Array.isArray(deadlinesRegistry.deadlines)) throw new Error('deadlines.json neobsahuje pole deadlines');
if (axiomsRegistry.status !== 'binding' || !Array.isArray(axiomsRegistry.axioms)) throw new Error('publication-axioms.json není závazný registr axiomů');

const institutions = Array.isArray(institutionsRegistry.institutions)
  ? institutionsRegistry.institutions
  : Object.values(institutionsRegistry.institutions || {});
const institutionIds = new Set(institutions.map(item => item.id));
const documentIds = new Set();

for (const item of documentsRegistry.documents) {
  for (const field of ['id', 'user_title', 'issue_date', 'institution_id', 'document_type']) {
    if (!item[field]) throw new Error(`Dokument ${item.id || '(bez ID)'} nemá pole ${field}`);
  }
  if (documentIds.has(item.id)) throw new Error(`Duplicitní stabilní ID: ${item.id}`);
  documentIds.add(item.id);
  if (!institutionIds.has(item.institution_id)) throw new Error(`Neznámá instituce ${item.institution_id} u ${item.id}`);
  for (const field of ['html', 'pdf']) {
    const value = item.public?.[field];
    if (typeof value === 'string' && value.startsWith('web/')) {
      throw new Error(`Veřejná cesta nesmí začínat web/: ${item.id} → ${value}`);
    }
  }
  const pdf = item.public?.pdf;
  if (pdf && !/^https?:\/\//i.test(pdf)) {
    const local = `web/${publicPath(pdf)}`;
    if (!(await exists(local))) throw new Error(`Registr odkazuje na chybějící PDF: ${item.id} → ${local}`);
    const bytes = await readFile(local);
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`Neplatný PDF podpis: ${item.id} → ${local}`);
  }
}

for (const item of deadlinesRegistry.deadlines) {
  if (!item.id || !item.trigger_document_id || !item.responsible_institution_id) throw new Error(`Neúplná lhůta: ${JSON.stringify(item)}`);
  if (!documentIds.has(item.trigger_document_id)) throw new Error(`Lhůta ${item.id} odkazuje na neexistující dokument ${item.trigger_document_id}`);
  if (item.response_document_id && !documentIds.has(item.response_document_id)) throw new Error(`Lhůta ${item.id} odkazuje na neexistující odpověď ${item.response_document_id}`);
}

// Jediné pořadí produkčního sestavení. Starší skripty jsou pouze podřízené renderery.
await run('scripts/build-dynamic-chronology.mjs');
await run('scripts/finalize-homepage.mjs');
await run('scripts/build-deadlines.mjs');

let article = await readFile(output.article, 'utf8');
article = article
  .replaceAll('Pavouk český křižák z Branibor již více než 15 let splétá síť na trase Praha–Brno–Praha a zpět. Kdo tu síť rozmotá?', correctTitle)
  .replaceAll('href="web/documents/', 'href="documents/')
  .replaceAll("href='web/documents/", "href='documents/");
await writeFile(output.article, article, 'utf8');

const home = await readFile(output.home, 'utf8');
for (const bar of [
  'Aktivní soudní řízení on-line od 1. května 2026',
  'Předžalobní řízení on-line od 1. května 2026',
  'Státní láska online od 1. května 2026'
]) {
  if (!home.includes(bar)) throw new Error(`Na titulní stránce chybí lišta: ${bar}`);
}
if (!article.includes(correctTitle)) throw new Error('Článek neobsahuje správný Godotův název');
if (article.includes(wrongTitle)) throw new Error('Článek obsahuje chybný název s křižákem z Branibor');
if (!article.includes('id="chronologie-seznam"')) throw new Error('Článek neobsahuje statickou chronologii');
if (/aktivní originály/i.test(article)) throw new Error('Článek obsahuje samostatný blok aktivních originálů');
if (/href=["']web\/documents\//i.test(article)) throw new Error('Článek obsahuje repozitářský prefix web/ ve veřejném odkazu');

const expectedChronology = documentsRegistry.documents.filter(item => item.issue_date >= '2026-05-01').length;
const chronologyCount = (article.match(/<li id="doc-[^"]*"/g) || []).length;
if (chronologyCount !== expectedChronology) throw new Error(`Chronologie má ${chronologyCount} položek, registr vyžaduje ${expectedChronology}`);

const hrefs = [...new Set([...home.matchAll(/href="([^"]+)"/g), ...article.matchAll(/href="([^"]+)"/g)].map(match => match[1]))];
for (const href of hrefs) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || /^(?:https?:|mailto:|javascript:|data:)/i.test(clean)) continue;
  const target = `web/${publicPath(clean)}`;
  if (!(await exists(target))) throw new Error(`Mrtvý lokální odkaz: ${href} → ${target}`);
  if (/\.pdf$/i.test(target)) {
    const bytes = await readFile(target);
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`Odkazovaný soubor není PDF: ${href}`);
  }
}

await mkdir(output.data, { recursive: true });
await copyFile(source.documents, `${output.data}/documents-2026.json`);
await copyFile(source.institutions, `${output.data}/institutions.json`);
await copyFile(source.deadlines, `${output.data}/deadlines-source.json`);
await copyFile(source.axioms, `${output.data}/publication-axioms.json`);

const publicPdfLinks = [...new Set(documentsRegistry.documents.map(item => item.public?.pdf).filter(Boolean).map(publicPath))];
const manifest = {
  schema_version: '2.0',
  generated_at: new Date().toISOString(),
  build_entrypoint: 'scripts/build-site.mjs',
  canonical_sources: source,
  derived_historical_manifests: ['project-memory/report-04082026-010-sources.json'],
  counts: {
    documents: documentsRegistry.documents.length,
    institutions: institutions.length,
    deadlines: deadlinesRegistry.deadlines.length,
    chronology_items: chronologyCount,
    checked_local_links: hrefs.length,
    public_pdf_links: publicPdfLinks.length
  },
  capabilities_preserved: {
    local_and_external_https_document_ingest: true,
    sha256_identity: true,
    relevance_with_explanation_and_human_review: true,
    deadline_and_inactivity_tracking: true,
    interactive_document_case_law_statute_memory: true,
    axioms_enforced: axiomsRegistry.axioms.map(item => item.id)
  },
  public_pdf_links: publicPdfLinks
};
await writeFile(`${output.data}/build-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Jednotný build: ${documentsRegistry.documents.length} dokumentů, ${chronologyCount} položek, ${hrefs.length} lokálních odkazů zkontrolováno.`);
