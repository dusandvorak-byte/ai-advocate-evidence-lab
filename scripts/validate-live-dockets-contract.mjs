import { readFile } from 'node:fs/promises';

const script = await readFile('web/live-dockets.js', 'utf8');
const styles = await readFile('web/home-rollups.css', 'utf8');
const home = await readFile('web/index.html', 'utf8');

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
if (!home.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Titulní stránka nenačítá generátor lišt');

console.log(`Smlouva titulní stránky: 3 lišty; ${caseRows.length} soudních řízení chronologicky; olejově modrá #285b6f; bílé písmo včetně časovačů.`);
