import { readFile, writeFile } from 'node:fs/promises';

const sources = JSON.parse(await readFile('project-memory/document-sources.json', 'utf8'));
if (!Array.isArray(sources.sources) || !sources.sources.length) throw new Error('document-sources.json neobsahuje kanonické zdroje dokumentů');
const sourceDocuments = [];
for (const source of sources.sources) {
  const registry = JSON.parse(await readFile(source.path, 'utf8'));
  if (!Array.isArray(registry.documents)) throw new Error(`${source.path} neobsahuje pole documents`);
  sourceDocuments.push(...registry.documents);
}
const documents = [...new Map(sourceDocuments.map(item => [item.id, item])).values()];
const stateRecords = documents.filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record');
const stateCount = stateRecords.length;
const latestIssueDate = stateRecords.map(item => item.issue_date).sort().at(-1);
if (!latestIssueDate) throw new Error('Registr neobsahuje žádnou státní listinu od 1. května 2026');

// Datum v horní liště je jediný veřejný údaj o aktuálním dni. Datum se bere z běhu buildu,
// nikoli z poslední listiny ani z ručně zapsaného HTML. Duplicitní „Aktualizováno …“ v edition-bar je zakázáno.
const now = new Date();
const day = now.getUTCDate();
const year = now.getUTCFullYear();
const czDisplayDate = `${day}. SRPNA ${year}`;
const enDisplayDate = `${day} AUGUST ${year}`;
const latest = new Date(`${latestIssueDate}T00:00:00Z`);
const latestCz = `${latest.getUTCDate()}. srpna ${latest.getUTCFullYear()}`;
const latestEn = `${latest.getUTCDate()} August ${latest.getUTCFullYear()}`;

const update = async (path, transforms) => {
  let html = await readFile(path, 'utf8');
  for (const [pattern, replacement, label, optional = false] of transforms) {
    if (!pattern.test(html)) {
      if (optional) continue;
      throw new Error(`${path}: nenalezen synchronizační bod ${label}`);
    }
    html = html.replace(pattern, replacement);
  }
  await writeFile(path, html, 'utf8');
};

await update('web/index.html', [
  [/data-current-date>[^<]+</, `data-current-date>${czDisplayDate}<`, 'jediné veřejné datum'],
  [/<span>Aktualizováno [^<]+<\/span>/i, '', 'duplicitní datum aktualizace', true]
]);
await update('web/en.html', [
  [/data-current-date>[^<]+</, `data-current-date>${enDisplayDate}<`, 'datum'],
  [/<span>Updated [^<]+<\/span>/i, '', 'duplicitní datum aktualizace', true]
]);
await update('web/kc/index.html', [[/(<header class="topline"><span>)[^<]+/, `$1${czDisplayDate}`, 'datum']]);
await update('web/kc/en.html', [[/(<header class="topline"><span>)[^<]+/, `$1${enDisplayDate}`, 'datum']]);
await update('web/news/index.html', [[/(<a href="zpravy\/04082026-010\.html"[^>]*>A time for the state to love<\/a><\/h2><p>)[^<]+/, `$1Czech canonical report: a living chronology of ${stateCount} state and public-institution records through ${latestEn}, with linked responses and source PDFs.`, 'Godot v anglickém archivu']]);
await update('web/zpravy/index.html', [[/(<a href="zpravy\/04082026-010\.html">Státu lásky čas<\/a><\/h2><p>)[^<]+/, `$1Živá chronologie ${stateCount} listin státu a veřejných institucí od 1. května do ${latestCz}, s propojenými reakcemi a zdrojovými PDF.`, 'Godot v českém archivu']]);

const surfaces = [['CannaInsider CZ','web/index.html'],['CannaInsider international','web/en.html'],['Konopná církev CZ','web/kc/index.html'],['Church of Cannabis international','web/kc/en.html']];
for (const [label, path] of surfaces) {
  const html = await readFile(path, 'utf8');
  for (const stylesheet of ['styles.css','brand.css']) if (!html.includes(`href="${stylesheet}"`)) throw new Error(`${label}: chybí společný ${stylesheet}`);
  if (!html.includes('class="topline"') || !html.includes('class="masthead"') || !html.includes('class="nav"')) throw new Error(`${label}: chybí společná rámová komponenta`);
}
const czHome = await readFile('web/index.html', 'utf8');
if (/Aktualizováno\s+\d/i.test(czHome)) throw new Error('Titulní stránka obsahuje zakázaný duplicitní údaj Aktualizováno');
if (!czHome.includes(`data-current-date>${czDisplayDate}<`)) throw new Error('Titulní stránka nemá dnešní kanonické datum');
console.log(`Veřejné varianty synchronizovány: ${czDisplayDate}; ${stateCount} státních listin; jediný veřejný údaj o dni je horní datum; 4/4 plochy sdílí layout.`);
