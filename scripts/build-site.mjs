import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const run = script => new Promise((resolve, reject) => {
  const child = spawn(globalThis.process.execPath, [script], { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} skončil kódem ${code}`)));
});
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');

const documentsRegistry = await readJson(source.documents);
const institutionsRegistry = await readJson(source.institutions);
const deadlinesRegistry = await readJson(source.deadlines);
const axiomsRegistry = await readJson(source.axioms);
if (!Array.isArray(documentsRegistry.documents)) throw new Error('documents-2026.json neobsahuje pole documents');
if (!Array.isArray(institutionsRegistry.institutions)) throw new Error('institutions.json neobsahuje pole institutions');
if (!Array.isArray(deadlinesRegistry.deadlines)) throw new Error('deadlines.json neobsahuje pole deadlines');
if (axiomsRegistry.status !== 'binding' || !Array.isArray(axiomsRegistry.axioms)) throw new Error('publication-axioms.json není závazný registr');

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
]) if (!home.includes(bar)) throw new Error(`Na titulní stránce chybí lišta: ${bar}`);
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

const publicPdfLinks = [...new Set(documentsRegistry.documents.map(item => item.public?.pdf).filter(Boolean).map(publicPath))];
const manifest = {
  schema_version: '2.0',
  generated_at: new Date().toISOString(),
  build_entrypoint: 'scripts/build-site.mjs',
  canonical_sources: source,
  counts: {
    documents: documentsRegistry.documents.length,
    institutions: institutionsRegistry.institutions.length,
    deadlines: deadlinesRegistry.deadlines.length,
    chronology_items: chronologyCount,
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
console.log(`Jednotný build vytvořen: ${chronologyCount} položek; živé URL a PDF ověří Pages workflow.`);
