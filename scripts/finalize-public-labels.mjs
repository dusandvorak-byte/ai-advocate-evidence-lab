import { readFile, writeFile } from 'node:fs/promises';

const oldTitle = 'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?';
const newTitle = 'Pavouk český křižák z Branibor již více než 15 let splétá síť na trase Praha–Brno–Praha a zpět. Kdo tu síť rozmotá?';

const files = [
  'web/zpravy/04082026-010.html',
  'web/document-chronology.js',
  'web/live-dockets.js'
];

for (const path of files) {
  let content = await readFile(path, 'utf8');
  content = content.replaceAll(oldTitle, newTitle);
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
if (!article.includes(newTitle)) throw new Error('Článek neobsahuje nový název Pavouka');
if (!article.includes('id="chronologie-seznam"')) throw new Error('Článek neobsahuje dynamicky sestavenou chronologii');
if (/aktivní originály/i.test(article)) throw new Error('Článek stále obsahuje samostatný blok aktivních originálů');

console.log('Nový název Pavouka, tři aktivní lišty a chronologie byly ověřeny.');
