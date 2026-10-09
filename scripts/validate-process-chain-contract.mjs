import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const json = async path => JSON.parse(await read(path));

const [script, styles, courtStyles, home, englishHome, timerBuilder, czechGodot, englishGodot, timerRegistry, axioms, courtRegistry] = await Promise.all([
  read('web/live-dockets.js'),
  read('web/home-rollups.css'),
  read('web/live-dockets.css'),
  read('web/index.html'),
  read('web/en.html'),
  read('scripts/build-process-timers.mjs'),
  read('web/zpravy/04082026-010.html'),
  read('web/news/04082026-010.html'),
  json('web/data/process-timers.json'),
  json('project-memory/publication-axioms.json'),
  json('project-memory/active-court-dockets.json')
]);

const fail = message => { throw new Error(`PROCESS-CHAIN-CONTRACT: ${message}`); };

for (const label of [
  'Godot online – rozhodnutí státních a veřejných institucí od 1. května 2026. Přijde Státu lásky čas?',
  'Aktivní soudní řízení od 1. května 2026',
  'justicni-slalom',
  "Godot online – decisions of state and public institutions since 1 May 2026. Will the State's time for love come?",
  'Active court proceedings since 1 May 2026',
  'justicni-slalom'
]) if (!script.includes(label)) fail(`chybí hlavní lišta ${label}`);

const courtRows = courtRegistry.rows || [];
if (courtRows.length !== 12) fail(`očekáváno 12 soudních větví v křížovém registru, nalezeno ${courtRows.length}`);
for (const required of [
  '2 T 104/2010','15 Nt 3104/2026','2 T 65/2011','15 Nt 3106/2026',
  '9 To 315/2026','9 To 316/2026','18 A 17/2026','18 A 23/2026',
  '15 A 44/2026','6 As 207/2026','8 Ad 9/2026','15 Ad 14/2026',
  '10 C 69/2026','3 Cmo 24/2026-26','1 As 395/2019'
]) if (!JSON.stringify(courtRegistry).includes(required)) fail(`soudní přehled postrádá ${required}`);
for (const token of ['position:sticky','.live-dockets .active-courts-table th:nth-child(1){width:42%}','overflow-x:auto']) {
  if (!courtStyles.includes(token)) fail(`soudní CSS postrádá ${token}`);
}
if (!script.includes("const registryUrl = '/ai-advocate-evidence-lab/data/active-court-dockets.json'")) fail('live-dockets.js nečte kanonický soudní registr');
if (!Array.isArray(timerRegistry.timers)) fail('web/data/process-timers.json nemá timers');
const expectedTimerCount = timerRegistry.timers.length;
if (expectedTimerCount < 1) fail('interní procesní registr je prázdný');
for (const [label,page] of [['CZ home',home],['EN home',englishHome],['CZ Godot',czechGodot],['EN Godot',englishGodot]]) {
  if (page.includes('data-timer-id="') || page.includes('id="procesni-casovace"')) fail(`${label} stále publikuje procesní časovač`);
  if (!page.includes('id="justicni-slalom"')) fail(`${label} postrádá archiv podání`);
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
const internalProcessHistory = JSON.stringify(timerRegistry);

for (const required of ['2026-08-24','1 ZN 7061/2026','2026-09-02','4 KZN 7116/2026','3 VZN 239/2026']) {
  if (!czechGodot.includes(required) && !internalProcessHistory.includes(required)) fail(`větev OSZ Frýdek-Místek postrádá ${required}`);
}
for (const required of ['CT 338889/2025','2026-08-28','RRTV/2026/20/fej','RRTV/7757/2026-fej']) {
  if (!czechGodot.includes(required) && !internalProcessHistory.includes(required)) fail(`větev ČT postrádá ${required}`);
}
for (const required of ['8 Ad 9/2026-85','15 A 44/2026-43','5 To 248/2026','KRPT-203594-8/ČJ-2026-0700KR','MK 53547/2026 SOCNS']) {
  if (!czechGodot.includes(required) && !internalProcessHistory.includes(required)) fail(`procesní genealogie postrádá ${required}`);
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
const godotWithoutSeparateArchive = czechGodot.replace(/<!-- JUSTICE-SLALOM:BEGIN -->[\s\S]*?<!-- JUSTICE-SLALOM:END -->/g,'');
const suspicious = publicLabelCheck(godotWithoutSeparateArchive);
if (suspicious.length) fail(`nejednotné veřejné popisky dokumentů: ${suspicious.join(' | ')}`);

console.log(`Procesní kontrakt OK: ${expectedTimerCount} interních záznamů, 0 veřejných časovačů, ${courtRows.length} soudních větví křížově hlídaných Godot ↔ Slalom ↔ cases; axiomy zachovány.`);
