import './finalize-public-labels-base.mjs';
import './finalize-public-layout.mjs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const oldText = 'Každá zpráva má mít dohledatelný zdroj';
const newText = 'Každá zpráva má dohledatelný zdroj';

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && /\.html$/i.test(entry.name)) files.push(full);
  }
  return files;
}

const htmlFiles = await walk('web');
let replacements = 0;
for (const file of htmlFiles) {
  let html = await readFile(file, 'utf8');
  const count = html.split(oldText).length - 1;
  if (!count) continue;
  html = html.replaceAll(oldText, newText);
  await writeFile(file, html, 'utf8');
  replacements += count;
}
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  if (html.includes(oldText)) throw new Error(`${file}: zůstala stará formulace`);
}

await import('./finalize-chronology-order.mjs');

const manifest = JSON.parse(await readFile('web/data/build-manifest.json', 'utf8'));
const pdfReport = JSON.parse(await readFile('web/data/pdf-reconciliation-report.json', 'utf8'));
const pdfAudit = JSON.parse(await readFile('web/data/godot-pdf-audit.json', 'utf8'));
const registry = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8'));
const stateCount = manifest?.counts?.state_public_submissions;
const verifiedPdfCount = pdfReport?.linked_pdf_count;
if (!Number.isInteger(stateCount) || stateCount < 1) throw new Error(`PRODUCTION-GATE state-count: neplatná hodnota ${stateCount}`);
if (!Number.isInteger(verifiedPdfCount) || verifiedPdfCount < 1) throw new Error(`PRODUCTION-GATE pdf-count: neplatná hodnota ${verifiedPdfCount}`);

const stateDates = (registry.documents || [])
  .filter(item => item.issue_date >= '2026-05-01' && (item.document_type === 'state_record' || item.submission_side === 'incoming_from_state_or_public_institution'))
  .map(item => item.issue_date)
  .filter(Boolean)
  .sort();
const latestIssueDate = stateDates.at(-1);
if (!latestIssueDate) throw new Error('PRODUCTION-GATE latest-date: chybí datum poslední státní listiny');
const latestDate = new Date(`${latestIssueDate}T12:00:00Z`);
const latestCz = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(latestDate);
const latestEn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(latestDate);

// Finální veřejné plochy musí být samy o sobě konzistentní i před spuštěním JS:
// žádný historický ruční počet, správný konec časové osy a jednotné označení veřejné kopie.
const surfacePaths = ['web/index.html', 'web/en.html', 'web/kc/index.html', 'web/kc/en.html'];
for (const file of surfacePaths) {
  let html = await readFile(file, 'utf8');
  html = html
    .replace(/data-state-document-count>\d+</g, `data-state-document-count>${stateCount}<`)
    .replace(/<h2>Kanonická důkazní paměť do [^<]+<\/h2>/g, `<h2>Kanonická důkazní paměť do ${latestCz}</h2>`)
    .replace(/<h2>Canonical evidence memory through [^<]+<\/h2>/g, `<h2>Canonical evidence memory through ${latestEn}</h2>`)
    .replace(/The canonical chronology now links \d+ public records/g, `The canonical chronology now links ${stateCount} public records`)
    .replaceAll('Anonymizovaná veřejná kopie PDF', 'Ověřená anonymizovaná veřejná kopie PDF')
    .replaceAll('Anonymised public PDF copy', 'Verified anonymised public PDF copy');
  await writeFile(file, html, 'utf8');
}

const home = await readFile('web/index.html', 'utf8');
const enHome = await readFile('web/en.html', 'utf8');
const churchHome = await readFile('web/kc/index.html', 'utf8');
const churchEn = await readFile('web/kc/en.html', 'utf8');
const liveDockets = await readFile('web/live-dockets.js', 'utf8');
const newsFeed = await readFile('web/news-feed.js', 'utf8');
for (const label of ['Godot online → každá zpráva má zdroj', 'Aktivní soudní řízení od 1. května 2026', 'Živé procesní časovače']) {
  if (!liveDockets.includes(label)) throw new Error(`Finální generátor postrádá lištu: ${label}`);
}
if (!home.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Finální titulní strana nenačítá generátor tří lišt');
if (liveDockets.includes('Předžalobní řízení on-line od 1. května 2026') || liveDockets.includes('Státní láska online od 1. května 2026')) throw new Error('Finální generátor obsahuje zrušené lišty');
if (liveDockets.includes("document.getElementById('latest-records')?.remove()")) throw new Error('RUNTIME-GATE: live-dockets.js odstraňuje synchronizovaný blok nejnovějších listin');
if (/Chronologický seznam \d+ listin sbírky Godot/i.test(newsFeed) || /chronological list of \d+ public records in the Godot/i.test(newsFeed)) throw new Error('NEWS-FEED-GATE: sdílený feed obsahuje ručně zapsaný počet Godota');
const article = await readFile('web/zpravy/04082026-010.html', 'utf8');
if (!/<li\b[^>]*\bid="doc-[^"]+"[^>]*><b>Datum:<\/b>/.test(article)) throw new Error('Finální chronologie nezačíná Datem');

// Produkční brána musí při chybě uvést konkrétní porušený kontrakt, nikoli pouze exit code 1.
const requireText = (name, text, needle) => {
  if (!text.includes(needle)) throw new Error(`PRODUCTION-GATE ${name}: chybí ${JSON.stringify(needle)}`);
  console.log(`PRODUCTION-GATE OK: ${name}`);
};

requireText('cz-state-count', article, `Stát: ${stateCount} evidovaných listin`);
requireText('cz-home-static-count', home, `data-state-document-count>${stateCount}<`);
requireText('en-state-count', enHome, `${stateCount} state and public-institution records`);
requireText('en-newsroom-derived-count', enHome, `The canonical chronology now links ${stateCount} public records`);
requireText('church-cz-state-count', churchHome, `${stateCount} listin státu a veřejných institucí`);
requireText('church-en-state-count', churchEn, `${stateCount} state and public-institution records`);
requireText('en-pdf-count', enHome, `${verifiedPdfCount} verified public PDFs`);
requireText('church-en-pdf-count', churchEn, `${verifiedPdfCount} verified public PDFs`);
requireText('cz-latest-date', home, `Kanonická důkazní paměť do ${latestCz}`);
requireText('en-latest-date', enHome, `Canonical evidence memory through ${latestEn}`);
requireText('church-cz-latest-date', churchHome, `Kanonická důkazní paměť do ${latestCz}`);
requireText('church-en-latest-date', churchEn, `Canonical evidence memory through ${latestEn}`);
for (const [name, surface] of [['cz-home', home], ['en-home', enHome], ['church-cz', churchHome], ['church-en', churchEn]]) {
  requireText(`${name}-latest-records`, surface, 'id="latest-records"');
  requireText(`${name}-latest-mzdr`, surface, 'MZDR 21970/2026-3/MIN/KAN');
}

for (const key of ['required_without_active_pdf_count','reaction_without_active_pdf_count','broken_article_pdf_link_count','invalid_registry_pdf_link_count','missing_rendered_reaction_count','missing_reaction_pdf_link_count']) {
  if (pdfAudit?.[key] !== 0) throw new Error(`PRODUCTION-GATE ${key}: očekáváno 0, nalezeno ${pdfAudit?.[key]}`);
  console.log(`PRODUCTION-GATE OK: ${key}`);
}

const kpr5772 = await readFile('web/listiny/doc-cz-kpr-2026-07-30-kpr-5772-2026-1.html', 'utf8');
const kpr5080 = await readFile('web/listiny/doc-cz-kpr-2026-08-03-kpr-5080-2026.html', 'utf8');
const nsz = await readFile('web/listiny/nsz-6-nzn-1737-2026-15.html', 'utf8');
requireText('nsz-original-label', nsz, 'Otevřít originální listinu v PDF');
requireText('article-public-copy-label', article, 'ověřená veřejná kopie PDF');
requireText('kpr-5772-public-copy-label', kpr5772, 'Otevřít ověřenou veřejnou kopii PDF');
requireText('kpr-5080-public-copy-label', kpr5080, 'Otevřít ověřenou veřejnou kopii PDF');
requireText('uoou-record', article, 'UOOU-05841/26-3');
requireText('current-date', article, '1. 9. 2026');

console.log(`Veřejná formulace sjednocena (${replacements} náhrad); 4/4 plochy, aktuální počty, datum poslední listiny, runtime nejnovějších záznamů, sdílený news feed a produkční brána byly finálně ověřeny.`);
