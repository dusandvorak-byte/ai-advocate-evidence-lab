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
console.log(`Veřejná formulace sjednocena (${replacements} náhrad); smlouva tří lišt a chronologie byly finálně ověřeny.`);
