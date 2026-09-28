import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const fail = message => { throw new Error(`JUSTICE-SLALOM-GATE: ${message}`); };
const memory = JSON.parse(await readFile('project-memory/documents-2026.json','utf8'));
const published = JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));
const manifest = JSON.parse(await readFile('web/data/build-manifest.json','utf8'));
const items = memory.documents.filter(item => item.justice_slalom);
const expectedRows = items.reduce((sum,item) => sum + item.justice_slalom.recipients.length, 0);
if (items.length < 47 || expectedRows < 65 || published.filings !== items.length || published.rows.length !== expectedRows) fail('nesouhlasí počet podání či adresátů');
if (manifest.counts.justice_slalom_filings !== items.length || manifest.counts.justice_slalom_recipient_rows !== expectedRows || manifest.capabilities_preserved.live_process_timers !== false) fail('publikační manifest neodpovídá archivu a zrušeným časovačům');
if (new Set(items.map(item => item.id)).size !== items.length) fail('duplicitní ID originálu');
if (new Set(published.rows.map(row => row.id)).size !== expectedRows) fail('duplicitní kombinace podání a adresáta');
if (items.some(item => 'date_note_cs' in item.justice_slalom || 'date_note_en' in item.justice_slalom) ||
    published.rows.some(row => 'date_note_cs' in row || 'date_note_en' in row)) fail('archiv nesmí obsahovat veřejné poznámky k datům');
for (const [index,row] of published.rows.entries()) if (row.number !== index + 1) fail(`číslování 1–${expectedRows}: řádek ${index + 1} má číslo ${row.number}`);
const expectedOrder = items.flatMap(item => item.justice_slalom.recipients.map((recipient, recipientOrder) => ({
  id: `${item.id}--${recipient.institution_id}`, date: item.issue_date,
  archiveNumber: item.justice_slalom.archive_number, recipientOrder
}))).sort((a,b) => a.date.localeCompare(b.date) || a.archiveNumber - b.archiveNumber || a.recipientOrder - b.recipientOrder);
if (JSON.stringify(published.rows.map(row => [row.id,row.date])) !== JSON.stringify(expectedOrder.map(row => [row.id,row.date]))) fail('řádky nejsou vzestupně podle doloženého data podání');

const pages = [
  ['web/index.html','cs'], ['web/en.html','en'],
  ['web/kc/index.html','cs'], ['web/kc/en.html','en'],
  ['web/zpravy/04082026-010.html','cs'], ['web/news/04082026-010.html','en']
];
const expectedIds = published.rows.map(row => row.id);
for (const [file,lang] of pages) {
  const html = await readFile(file,'utf8');
  if ((html.match(/id="justicni-slalom"/g) || []).length !== 1) fail(`${file}: chybí jedna rozbalovací lišta`);
  const ids = [...html.matchAll(/<tr data-slalom-id="([^"]+)"/g)].map(match => match[1]);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) fail(`${file}: chybí řádky nebo se liší chronologie`);
  if (/slalom-date-note|V poskytnutém PDF je v záhlaví omylem|Datum v těle podání je|Podáno 23\. července;|V těle podání je uvedeno 25\. července;|The supplied PDF header mistakenly says/.test(html)) fail(`${file}: v archivu zůstala vysvětlující poznámka k datu`);
  const headers = lang === 'cs' ? ['Č.','Datum','Adresát','č. j./sp. zn.','Předmět podání'] : ['No.','Date','Addressee','Ref./case no.','Subject of filing'];
  for (const header of headers) if (!html.includes(`>${header}</th>`)) fail(`${file}: chybí sloupec ${header}`);
  if (!html.includes('číst jako investigativu s láskou') && lang === 'cs') fail(`${file}: chybí česká výzva`);
  if (!html.includes('❤️') || !html.includes('justice-slalom.css')) fail(`${file}: chybí srdce či styly`);
  for (const row of published.rows) {
    const href = `/ai-advocate-evidence-lab/${row.pdf}`;
    const rendered = html.match(new RegExp(`<tr data-slalom-id="${row.id}"[^>]*>[\\s\\S]*?<\\/tr>`))?.[0] || '';
    if (!rendered.includes(`data-row-number="${row.number}"`) || !rendered.includes(`<td class="slalom-number">${row.number}</td>`)) fail(`${file}: neplatné číslo řádku ${row.id}`);
    const pdfLinks = [...rendered.matchAll(/<a\s+href="([^"]+\.pdf)"/g)];
    if (pdfLinks.length !== 1 || pdfLinks[0][1] !== href) fail(`${file}: řádek ${row.number} nemá právě jedno správné PDF`);
  }
}
const kpr = items.find(item => item.justice_slalom.archive_number === 2);
if (kpr?.issue_date !== '2026-07-06' || !published.rows.some(row => row.document_id === kpr.id && row.date === '2026-07-06')) fail('KPR: v chronologii chybí datum 6. července 2026');
for (const item of items) {
  const file = `web/${item.public.pdf}`;
  const bytes = await readFile(file).catch(() => fail(`chybí ${file}`));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== item.public.sha256 || hash !== item.justice_slalom.source_sha256 || !bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF')) fail(`poškozené nebo jiné PDF než přesný originál ${item.id}`);
  if (!published.rows.filter(row => row.document_id === item.id).every(row => row.pdf_sha256 === hash)) fail(`hash adresátů nesouhlasí ${item.id}`);
}
async function walk(dir) {
  const files=[];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}
for (const file of await walk('web')) {
  const html = await readFile(file,'utf8');
  if (/data-timer-id=|id="procesni-casovace"|PROCESS-TIMERS:BEGIN|Živé procesní časovače|Live procedural timers/.test(html)) fail(`veřejná stránka obsahuje původní časovač: ${file}`);
}
console.log(`Justiční slalom OK: ${items.length} originálů, ${expectedRows} chronologických číslovaných řádků, 6/6 stran, právě jeden PDF odkaz na řádek a žádné veřejné časovače.`);
