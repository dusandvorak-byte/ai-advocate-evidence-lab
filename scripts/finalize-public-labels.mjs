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
await import('./build-home-rollups.mjs');

const home = await readFile('web/index.html', 'utf8');
const article = await readFile('web/zpravy/04082026-010.html', 'utf8');
const rollupCount = (home.match(/data-home-rollup=/g) || []).length;
if (rollupCount !== 6) throw new Error(`Finální titulní strana nemá přesně šest lišt: ${rollupCount}`);
if ((home.match(/id="home-rollup-stack"/g) || []).length !== 1) throw new Error('Finální titulní strana nemá právě jeden kanonický zásobník šesti lišt');
if (home.includes('class="edition-bar"') || /Aktualizováno\s+\d/i.test(home)) throw new Error('Finální titulní strana stále obsahuje odstraněnou lištu aktualizace');
if (!home.includes('data-home-rollup="godot"') || !home.includes('href="zpravy/04082026-010.html#chronologie"')) throw new Error('Státu lásky čas nevede přímo do chronologie');
if (!home.includes('data-home-rollup="lead"') || !home.includes('href="zpravy/07082026-011.html"')) throw new Error('CannaInsider.EU NEWS nevede přímo na report 07082026-011');
if (!/<li\b[^>]*\bid="doc-[^"]+"[^>]*><b>Datum:<\/b>/.test(article)) throw new Error('Finální chronologie nezačíná Datem');
console.log(`Veřejná formulace sjednocena (${replacements} náhrad); šest lišt a chronologie Datum → Kdo → Č. j./sp. zn. → Co se stalo byly finálně ověřeny.`);
