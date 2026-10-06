import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const articlePath = 'web/zpravy/04082026-010.html';
const article = await readFile(articlePath, 'utf8');
const rows = [...article.matchAll(/<tr id="doc-[^"]+"[^>]*data-row-number="(\d+)"[^>]*data-issue-date="([^"]+)"[^>]*>/g)]
  .map(match => ({ number:Number(match[1]), date:match[2] }));
if (!rows.length) throw new Error('Státu lásky čas nemá tabulkové řádky');
for (let i=0;i<rows.length;i+=1) {
  if (rows[i].number !== rows.length-i) throw new Error(`Číslování Státu lásky čas: řádek ${i+1} má ${rows[i].number}, očekáváno ${rows.length-i}`);
  if (i>0 && rows[i-1].date.localeCompare(rows[i].date) < 0) throw new Error(`Státu lásky čas není vizuálně sestupně podle data: ${rows[i-1].date} před ${rows[i].date}`);
}
if (rows.at(-1).number !== 1) throw new Error('Nejstarší dokument dole nemá číslo 1');
console.log(`Státu lásky čas: ${rows.length} řádků, nejnovější nahoře, nejstarší číslo 1.`);

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
