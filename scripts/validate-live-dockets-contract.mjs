import { readFile } from 'node:fs/promises';

const script = await readFile('web/live-dockets.js', 'utf8');
const styles = await readFile('web/home-rollups.css', 'utf8');
const home = await readFile('web/index.html', 'utf8');
const englishHome = await readFile('web/en.html', 'utf8');
const newsFeed = await readFile('web/news-feed.js', 'utf8');

const requiredBars = [
  'Godot online → každá zpráva má zdroj',
  'Aktivní soudní řízení od 1. května 2026',
  'Živé procesní časovače'
];
for (const label of requiredBars) {
  if (!script.includes(label)) throw new Error(`Chybí hlavní lišta: ${label}`);
}
for (const obsolete of ['Předžalobní řízení on-line od 1. května 2026', 'Státní láska online od 1. května 2026']) {
  if (script.includes(obsolete)) throw new Error(`Vrátila se zrušená lišta: ${obsolete}`);
}

const caseRows = [...script.matchAll(/\['(\d{4}-\d{2}-\d{2})',\s*'([^']+)',\s*[^\]]+\]/g)]
  .map(([, date, label]) => ({ date, label }));
if (caseRows.length !== 9) throw new Error(`Očekáváno devět soudních řízení, nalezeno ${caseRows.length}`);
for (let index = 1; index < caseRows.length; index += 1) {
  if (caseRows[index - 1].date > caseRows[index].date) {
    throw new Error(`Soudní řízení nejsou chronologicky: ${caseRows[index - 1].label} → ${caseRows[index].label}`);
  }
}
if (!script.includes('link.dataset.startDate = startDate')) throw new Error('Soudní odkazy nemají veřejně kontrolovatelné datum počátku');

for (const declaration of ['background: #285b6f;', 'color: #fff;', 'color: #fff !important;']) {
  if (!styles.includes(declaration)) throw new Error(`Chybí barevná smlouva lišt: ${declaration}`);
}
if (!styles.includes('#live-dockets.home-rollup-stack-primary > #procesni-casovace[open]')) {
  throw new Error('Chybí samostatná barevná smlouva rozbalených časovačů');
}
if (!styles.includes('#procesni-casovace[open] .historical-notice *') || !styles.includes('color: #111 !important;')) {
  throw new Error('Bílé historické referenční karty nemají vynucené černé písmo');
}

// Mobilní smlouva: lišty nesmějí přesáhnout obrazovku a rozbalené soudní
// karty se na telefonu skládají do jediného sloupce.
if (!styles.includes('width: min(100%, var(--page-shell-width, 1240px))')) {
  throw new Error('Tři hlavní lišty nejsou omezené šířkou obrazovky');
}
if (!styles.includes('@media(max-width:720px)')) {
  throw new Error('Chybí mobilní rozložení záhlaví tří lišt');
}
const phoneCourtRule = styles.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n\}/)?.[1] || '';
if (!phoneCourtRule.includes('grid-template-columns: 1fr')) {
  throw new Error('Soudní karty se na telefonu neskládají do jednoho sloupce');
}
if (!styles.includes('#semafor.utility-grid')
  || !styles.includes('grid-template-columns: minmax(0,1fr)')
  || !styles.includes('#semafor.utility-grid > .desk')) {
  throw new Error('Důkazní přepážka nemá smlouvu plné šířky');
}
if (!home.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Titulní stránka nenačítá generátor lišt');
if (!englishHome.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Anglická titulní stránka nenačítá generátor tří lišt');
if (!englishHome.includes('data-shared-news-feed') || !englishHome.includes('Further current reports')) throw new Error('Anglická titulní stránka nemá blok dalších aktuálních zpráv');
if (englishHome.includes('class="quick-memory"') || englishHome.includes('href="#memory"')) throw new Error('Anglická titulní stránka stále obsahuje zrušený vedlejší blok Case memory');
if (!styles.includes('#traffic.utility-grid') || !styles.includes('#traffic.utility-grid > .desk')) throw new Error('Anglická důkazní přepážka nemá plnou šířku');
for (const label of ['Godot online → every report has a source', 'Active court proceedings since 1 May 2026', 'Live procedural timers']) {
  if (!script.includes(label)) throw new Error(`Chybí anglická hlavní lišta: ${label}`);
}
for (const id of ['07082026-011','04082026-010','28072026-009','25072026-007','24072026-006','24072026-005','23072026-004','22072026-002','20072026-001']) {
  if (!newsFeed.includes(`hrefEn: 'news/${id}.html'`)) throw new Error(`Zpráva ${id} nemá skutečnou anglickou stránku`);
}

console.log(`Smlouva titulní stránky: 3 lišty; ${caseRows.length} soudních řízení chronologicky; olejově modrá #285b6f; bílé písmo včetně časovačů; mobilní skládání; důkazní přepážka přes celou stránku.`);
