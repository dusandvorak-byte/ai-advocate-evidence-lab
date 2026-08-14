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

const home = await readFile('web/index.html', 'utf8');
if (!home.includes(newText)) throw new Error(`Na titulní stránce chybí požadovaná věta: ${newText}`);
console.log(`Veřejná formulace sjednocena: „${newText}“ (${replacements} náhrad).`);
