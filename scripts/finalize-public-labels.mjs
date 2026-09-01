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

const home = await readFile('web/index.html', 'utf8');
const liveDockets = await readFile('web/live-dockets.js', 'utf8');
for (const label of ['Godot online → každá zpráva má zdroj', 'Aktivní soudní řízení od 1. května 2026', 'Živé procesní časovače']) {
  if (!liveDockets.includes(label)) throw new Error(`Finální generátor postrádá lištu: ${label}`);
}
if (!home.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Finální titulní strana nenačítá generátor tří lišt');
if (liveDockets.includes('Předžalobní řízení on-line od 1. května 2026') || liveDockets.includes('Státní láska online od 1. května 2026')) throw new Error('Finální generátor obsahuje zrušené lišty');
const article = await readFile('web/zpravy/04082026-010.html', 'utf8');
if (!/<li\b[^>]*\bid="doc-[^"]+"[^>]*><b>Datum:<\/b>/.test(article)) throw new Error('Finální chronologie nezačíná Datem');

// Produkční brána musí při chybě uvést konkrétní porušený kontrakt, nikoli pouze exit code 1.
const requireText = (name, text, needle) => {
  if (!text.includes(needle)) throw new Error(`PRODUCTION-GATE ${name}: chybí ${JSON.stringify(needle)}`);
  console.log(`PRODUCTION-GATE OK: ${name}`);
};

const manifest = JSON.parse(await readFile('web/data/build-manifest.json', 'utf8'));
const pdfReport = JSON.parse(await readFile('web/data/pdf-reconciliation-report.json', 'utf8'));
const pdfAudit = JSON.parse(await readFile('web/data/godot-pdf-audit.json', 'utf8'));
const enHome = await readFile('web/en.html', 'utf8');
const churchEn = await readFile('web/kc/en.html', 'utf8');
const kpr5772 = await readFile('web/listiny/doc-cz-kpr-2026-07-30-kpr-5772-2026-1.html', 'utf8');
const kpr5080 = await readFile('web/listiny/doc-cz-kpr-2026-08-03-kpr-5080-2026.html', 'utf8');
const nsz = await readFile('web/listiny/nsz-6-nzn-1737-2026-15.html', 'utf8');

const stateCount = manifest?.counts?.state_public_submissions;
const verifiedPdfCount = pdfReport?.linked_pdf_count;
if (!Number.isInteger(stateCount) || stateCount < 1) throw new Error(`PRODUCTION-GATE state-count: neplatná hodnota ${stateCount}`);
if (!Number.isInteger(verifiedPdfCount) || verifiedPdfCount < 1) throw new Error(`PRODUCTION-GATE pdf-count: neplatná hodnota ${verifiedPdfCount}`);
requireText('cz-state-count', article, `Stát: ${stateCount} evidovaných listin`);
requireText('en-state-count', enHome, `${stateCount} state and public-institution records`);
requireText('church-en-state-count', churchEn, `${stateCount} state and public-institution records`);
requireText('en-pdf-count', enHome, `${verifiedPdfCount} verified public PDFs`);
requireText('church-en-pdf-count', churchEn, `${verifiedPdfCount} verified public PDFs`);

for (const key of ['required_without_active_pdf_count','reaction_without_active_pdf_count','broken_article_pdf_link_count','invalid_registry_pdf_link_count','missing_rendered_reaction_count','missing_reaction_pdf_link_count']) {
  if (pdfAudit?.[key] !== 0) throw new Error(`PRODUCTION-GATE ${key}: očekáváno 0, nalezeno ${pdfAudit?.[key]}`);
  console.log(`PRODUCTION-GATE OK: ${key}`);
}

requireText('nsz-original-label', nsz, 'Otevřít originální listinu v PDF');
requireText('article-public-copy-label', article, 'ověřená veřejná kopie PDF');
requireText('kpr-5772-public-copy-label', kpr5772, 'Otevřít ověřenou veřejnou kopii PDF');
requireText('kpr-5080-public-copy-label', kpr5080, 'Otevřít ověřenou veřejnou kopii PDF');
requireText('uoou-record', article, 'UOOU-05841/26-3');
requireText('current-date', article, '1. 9. 2026');

console.log(`Veřejná formulace sjednocena (${replacements} náhrad); smlouva tří lišt, chronologie a diagnostická produkční brána byly finálně ověřeny.`);
