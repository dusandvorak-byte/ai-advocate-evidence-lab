import { readFile, readdir, writeFile } from 'node:fs/promises';

const wrongTitle = 'Pavouk český křižák z Branibor již více než 15 let splétá síť na trase Praha–Brno–Praha a zpět. Kdo tu síť rozmotá?';
const correctTitle = 'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?';

const files = [
  'web/zpravy/04082026-010.html',
  'web/document-chronology.js',
  'web/live-dockets.js'
];

const listiny = (await readdir('web/listiny'))
  .filter(name => name.endsWith('.html'))
  .map(name => `web/listiny/${name}`);

for (const path of [...files, ...listiny]) {
  let content = await readFile(path, 'utf8');
  content = content.replaceAll(wrongTitle, correctTitle);
  content = content.replaceAll('href="web/documents/', 'href="documents/');
  content = content.replaceAll("href = 'web/documents/", "href = 'documents/");
  content = content.replaceAll('"web/documents/', '"documents/');
  content = content.replaceAll("'web/documents/", "'documents/");

  content = content.replace(
    /<a href="([^"]*verejna-kopie\.pdf)"([^>]*)>originál PDF<\/a>/gi,
    '<a href="$1"$2>ověřená veřejná kopie PDF</a>'
  );
  content = content.replace(
    /<a href="([^"]*verejna-kopie\.pdf)"([^>]*)>Otevřít originální listinu v PDF<\/a>/gi,
    '<a href="$1"$2>Otevřít ověřenou veřejnou kopii PDF</a>'
  );

  await writeFile(path, content, 'utf8');
}

const home = await readFile('web/index.html', 'utf8');
const article = await readFile('web/zpravy/04082026-010.html', 'utf8');

const requiredBars = [
  'Aktivní soudní řízení on-line od 1. května 2026',
  'Předžalobní řízení on-line od 1. května 2026',
  'Státní láska online od 1. května 2026'
];

for (const label of requiredBars) {
  if (!home.includes(label)) throw new Error(`Na titulní stránce chybí lišta: ${label}`);
}
if (!article.includes(correctTitle)) throw new Error('Článek neobsahuje správný název Pavouka s Godotem');
if (article.includes(wrongTitle)) throw new Error('Článek stále obsahuje chybný název s křižákem z Branibor');
if (!article.includes('id="chronologie-seznam"')) throw new Error('Článek neobsahuje sestavenou chronologii');
if (/aktivní originály/i.test(article)) throw new Error('Článek stále obsahuje samostatný blok aktivních originálů');
if (/href="web\/documents\//i.test(article)) throw new Error('Článek obsahuje nefunkční PDF odkaz s prefixem web/');
if (/<a href="[^"]*verejna-kopie\.pdf"[^>]*>\s*(?:originál PDF|Otevřít originální listinu v PDF)\s*<\/a>/i.test(article)) {
  throw new Error('Odvozená veřejná kopie je v článku chybně označena jako originál');
}

for (const path of listiny) {
  const content = await readFile(path, 'utf8');
  if (/<a href="[^"]*verejna-kopie\.pdf"[^>]*>\s*Otevřít originální listinu v PDF\s*<\/a>/i.test(content)) {
    throw new Error(`Odvozená veřejná kopie je na ${path} chybně označena jako originál`);
  }
}

await import('./enforce-homepage-brand.mjs');
await import('./enforce-shared-shell.mjs');
console.log('Godotův název, tři lišty, chronologie, veřejné cesty PDF, podtext CannaInsider.EU a společná šířka byly ověřeny.');
