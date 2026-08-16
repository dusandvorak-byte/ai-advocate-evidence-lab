import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const articlePath = 'web/zpravy/04082026-010.html';
const chronologyPattern = /(<li\b[^>]*\bid="doc-[^"]+"[^>]*>)<b>Kdo:<\/b>\s*([\s\S]*?)\s*·\s*<b>Datum:<\/b>\s*([\s\S]*?)\s*·\s*<b>Č\. j\. \/ sp\. zn\.:<\/b>\s*([\s\S]*?)\s*·\s*<b>Co se stalo:<\/b>/g;

let article = await readFile(articlePath, 'utf8');
let changed = 0;
article = article.replace(chronologyPattern, (_all, open, who, date, reference) => {
  changed += 1;
  return `${open}<b>Datum:</b> ${date.trim()} · <b>Kdo:</b> ${who.trim()} · <b>Č. j. / sp. zn.:</b> ${reference.trim()} · <b>Co se stalo:</b>`;
});

const entries = [...article.matchAll(/<li\b[^>]*\bid="doc-[^"]+"[^>]*data-issue-date="([^"]+)"[^>]*>/g)].map(match => match[1]);
for (let i = 1; i < entries.length; i += 1) {
  if (entries[i - 1].localeCompare(entries[i]) > 0) throw new Error(`Chronologie není vzestupně seřazena: ${entries[i - 1]} před ${entries[i]}`);
}
const itemCount = (article.match(/<li\b[^>]*\bid="doc-[^"]+"/g) || []).length;
const dateFirstCount = (article.match(/<li\b[^>]*\bid="doc-[^"]+"[^>]*><b>Datum:<\/b>/g) || []).length;
if (!itemCount || dateFirstCount !== itemCount) throw new Error(`Ne všechny položky začínají Datem: ${dateFirstCount}/${itemCount}`);
await writeFile(articlePath, article, 'utf8');

const listinyDir = 'web/listiny';
let pageChanges = 0;
for (const entry of await readdir(listinyDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const file = path.join(listinyDir, entry.name);
  let html = await readFile(file, 'utf8');
  const before = html;
  html = html.replace(/<p><b>Kdo:<\/b>\s*([\s\S]*?)<\/p><p><b>Datum:<\/b>\s*([\s\S]*?)<\/p><p><b>Č\. j\. \/ sp\. zn\.:<\/b>/, '<p><b>Datum:</b> $2</p><p><b>Kdo:</b> $1</p><p><b>Č. j. / sp. zn.:</b>');
  if (html !== before) { await writeFile(file, html, 'utf8'); pageChanges += 1; }
}
console.log(`Chronologie vynucena v pořadí Datum → Kdo → Č. j./sp. zn. → Co se stalo: ${changed} položek; ${pageChanges} evidenčních stránek.`);
