import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const json = async path => JSON.parse(await read(path));

const [script, styles, home, englishHome, timerBuilder, czechGodot, englishGodot, timerRegistry, axioms] = await Promise.all([
  read('web/live-dockets.js'),
  read('web/home-rollups.css'),
  read('web/index.html'),
  read('web/en.html'),
  read('scripts/build-process-timers.mjs'),
  read('web/zpravy/04082026-010.html'),
  read('web/news/04082026-010.html'),
  json('web/data/process-timers.json'),
  json('project-memory/publication-axioms.json')
]);

const fail = message => { throw new Error(`PROCESS-CHAIN-CONTRACT: ${message}`); };

for (const label of [
  'Godot online → každá zpráva má zdroj',
  'Aktivní soudní řízení od 1. května 2026',
  'Živé procesní časovače',
  'Godot online → every report has a source',
  'Active court proceedings since 1 May 2026',
  'Live procedural timers'
]) if (!script.includes(label)) fail(`chybí hlavní lišta ${label}`);

const caseRows = [...script.matchAll(/\['(\d{4}-\d{2}-\d{2})',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\]/g)]
  .map(([,date,cs,en,anchor]) => ({date,cs,en,anchor}));
if (caseRows.length !== 9) fail(`očekáváno 9 aktivních soudních větví, nalezeno ${caseRows.length}`);
for (let i=1;i<caseRows.length;i+=1) if (caseRows[i-1].date > caseRows[i].date) fail(`soudní větve nejsou chronologické: ${caseRows[i-1].cs} → ${caseRows[i].cs}`);
for (const name of ['Městský soud v Praze','Obvodní soud pro Prahu 4','Okresní soud v Prostějově','Okresní soud v Ostravě','Krajský soud v Ostravě','Nejvyšší správní soud']) {
  if (!caseRows.some(row => row.cs.includes(name))) fail(`v aktivních soudních větvích chybí ${name}`);
}
if (!caseRows.some(row => row.cs.includes('5 To 248/2026') && row.cs.includes('15 T 11/2025'))) fail('ostravská větev neukazuje 5 To 248/2026 i původní 15 T 11/2025');
if (!caseRows.some(row => row.cs.includes('nová zásahová žaloba proti SÚKL'))) fail('chybí aktivní nová žaloba proti SÚKL');
if (!caseRows.some(row => row.cs.includes('kasační stížnost') && row.cs.includes('15 A 44/2026'))) fail('15 A 44/2026 není převedeno do kasační fáze');

if (!Array.isArray(timerRegistry.timers)) fail('web/data/process-timers.json nemá timers');
const expectedTimerCount = timerRegistry.timers.length;
const homeTimerCount = (home.match(/data-timer-id="/g) || []).length;
const englishTimerCount = (englishHome.match(/data-timer-id="/g) || []).length;
if (homeTimerCount !== expectedTimerCount) fail(`CZ titulní stránka má ${homeTimerCount} časovačů, registr ${expectedTimerCount}`);
if (englishTimerCount !== expectedTimerCount) fail(`EN titulní stránka má ${englishTimerCount} časovačů, registr ${expectedTimerCount}`);
if ((czechGodot.match(/data-timer-id="/g) || []).length !== expectedTimerCount) fail('CZ Godot nemá stejný počet časovačů jako registr');
if ((englishGodot.match(/data-timer-id="/g) || []).length !== expectedTimerCount) fail('EN Godot nemá stejný počet časovačů jako registr');

for (const forbidden of ['timer-admin-msz-odvolani-sin48-2026','timer-admin-msz-stiznost-necinnost-2026-07-31']) {
  for (const [label,page] of [['CZ home',home],['EN home',englishHome],['CZ Godot',czechGodot],['EN Godot',englishGodot]]) {
    if (page.includes(`data-timer-id="${forbidden}"`)) fail(`${label} stále obsahuje uzavřený samostatný časovač ${forbidden}`);
  }
}

const requiredAxioms = [
  'full-process-chain-timer',
  'deadline-chain-slash-display',
  'state-response-immediate-timer-projection',
  'supplement-preserves-original-deadline',
  'data-box-filing-equals-delivery',
  'public-document-link-labels',
  'constitutional-reconstructability',
  'batched-ci-and-notification-discipline'
];
const axiomIds = new Set((axioms.axioms || []).map(item => item.id));
for (const id of requiredAxioms) if (!axiomIds.has(id)) fail(`chybí závazný axiom ${id}`);

for (const marker of ['process-chain','deadline-chain']) {
  if (!czechGodot.includes(marker) || !home.includes(marker)) fail(`CZ výstupy nemají marker ${marker}`);
}
for (const required of ['2026-08-24','1 ZN 7061/2026','2026-09-02','4 KZN 7116/2026','3 VZN 239/2026']) {
  if (!czechGodot.includes(required)) fail(`větev OSZ Frýdek-Místek postrádá ${required}`);
}
for (const required of ['CT 338889/2025','2026-08-28','RRTV/2026/20/fej','RRTV/7757/2026-fej']) {
  if (!czechGodot.includes(required)) fail(`větev ČT postrádá ${required}`);
}
for (const required of ['8 Ad 9/2026-85','15 A 44/2026-43','5 To 248/2026','KRPT-203594-8/ČJ-2026-0700KR','MK 53547/2026 SOCNS']) {
  if (!czechGodot.includes(required)) fail(`procesní genealogie postrádá ${required}`);
}

if (!styles.includes('width: min(100%, var(--page-shell-width, 1240px))')) fail('hlavní lišty nejsou omezeny šířkou obrazovky');
if (!styles.includes('@media(max-width:720px)')) fail('chybí mobilní smlouva');
if (!home.includes('<script src="live-dockets.js" defer></script>') || !englishHome.includes('<script src="live-dockets.js" defer></script>')) fail('titulní stránky nenačítají live-dockets.js');

for (const phrase of ['Povinný formát:', 'Počítání:', 'Úplnost:']) if (timerBuilder.includes(phrase)) fail(`generátor obsahuje pracovní text ${phrase}`);

const publicLabelCheck = html => {
  const links = [...html.matchAll(/<a[^>]+href="[^"]+"[^>]*>([^<]+)<\/a>/g)].map(m => m[1].trim());
  const suspicious = links.filter(label => /PDF|kopie|listina|dokument/i.test(label) && !['Dokument v PDF','Evidenční stránka'].includes(label));
  return suspicious.slice(0,5);
};
const suspicious = publicLabelCheck(czechGodot);
if (suspicious.length) fail(`nejednotné veřejné popisky dokumentů: ${suspicious.join(' | ')}`);

console.log(`Procesní kontrakt OK: ${expectedTimerCount} kanonických časovačů; 9 aktivních soudních větví; uzavřené samostatné časovače odstraněny; nové axiomy vynuceny.`);
