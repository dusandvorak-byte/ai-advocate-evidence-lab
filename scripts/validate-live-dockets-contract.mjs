import { readFile, readdir } from 'node:fs/promises';

const script = await readFile('web/live-dockets.js', 'utf8');
const styles = await readFile('web/home-rollups.css', 'utf8');
const home = await readFile('web/index.html', 'utf8');
const englishHome = await readFile('web/en.html', 'utf8');
const newsFeed = await readFile('web/news-feed.js', 'utf8');
const publishWorkflow = await readFile('.github/workflows/publish-gh-pages-branch.yml', 'utf8');
const timerBuilder = await readFile('scripts/build-process-timers.mjs', 'utf8');
const englishGodot = await readFile('web/news/04082026-010.html', 'utf8');
const canonicalDocuments = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8'));
const automaticTranslation = await readFile('web/auto-translate.js', 'utf8');

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
const latestStateRecord = canonicalDocuments.documents
  .filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record')
  .sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)) || String(a.id).localeCompare(String(b.id)))
  .at(-1);
const nowHref = `zpravy/04082026-010.html#${latestStateRecord.id}`;
if (!home.includes(`<a href="${nowHref}">Právě teď</a>`)) throw new Error('Odkaz Právě teď nevede na poslední rozhodnutí státu v Godotovi');
const czechGodot = await readFile('web/zpravy/04082026-010.html', 'utf8');
if (!czechGodot.includes(`id="${latestStateRecord.id}"`)) throw new Error('Cíl odkazu Právě teď v českém Godotovi neexistuje');
if (!englishHome.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Anglická titulní stránka nenačítá generátor tří lišt');
for (const page of [home, englishHome]) if (!page.includes('src="auto-translate.js"')) throw new Error('Titulní stránka nemá nabídku automatických překladů');
for (const required of ["['pt', 'Português']", '100+ other languages via Google Translate', 'Czech official records and PDFs remain controlling']) {
  if (!automaticTranslation.includes(required)) throw new Error(`Automatickému překladu chybí: ${required}`);
}
if (!englishHome.includes('data-shared-news-feed') || !englishHome.includes('Further current reports')) throw new Error('Anglická titulní stránka nemá blok dalších aktuálních zpráv');
if (englishHome.includes('class="quick-memory"') || englishHome.includes('href="#memory"')) throw new Error('Anglická titulní stránka stále obsahuje zrušený vedlejší blok Case memory');
if (!styles.includes('#traffic.utility-grid') || !styles.includes('#traffic.utility-grid > .desk')) throw new Error('Anglická důkazní přepážka nemá plnou šířku');
for (const label of ['Godot online → every report has a source', 'Active court proceedings since 1 May 2026', 'Live procedural timers']) {
  if (!script.includes(label)) throw new Error(`Chybí anglická hlavní lišta: ${label}`);
}
for (const id of ['07082026-011','04082026-010','28072026-009','25072026-007','24072026-006','24072026-005','23072026-004','22072026-002','20072026-001']) {
  if (!newsFeed.includes(`hrefEn: 'news/${id}.html'`)) throw new Error(`Zpráva ${id} nemá skutečnou anglickou stránku`);
}
const englishArchive = await readFile('web/news/index.html', 'utf8');
for (const id of ['04082026-010','28072026-009','25072026-007','24072026-006','24072026-005','23072026-004','22072026-002','20072026-001']) {
  if (!englishArchive.includes(`href="news/${id}.html"`)) throw new Error(`Anglický archiv nevede na anglickou zprávu ${id}`);
  if (englishArchive.includes(`href="zpravy/${id}.html"`)) throw new Error(`Anglický archiv stále vede na českou zprávu ${id}`);
}
const mergedEnglishReport = await readFile('web/news/23072026-003.html', 'utf8');
if (!mergedEnglishReport.includes('url=/ai-advocate-evidence-lab/news/24072026-005.html')) throw new Error('Sloučený report 23072026-003 nemá anglické přesměrování');
if (newsFeed.includes('item.hrefEn || item.href')) throw new Error('Anglický feed stále dovoluje tichý návrat na český článek');
if (!publishWorkflow.includes('grep -q "live-dockets.js?v=${version}" /tmp/verified-site/en.html')
  || !publishWorkflow.includes('grep -q "news-feed.js?v=${version}" /tmp/verified-site/en.html')) {
  throw new Error('Workflow neverzuje anglické lišty a anglický zdroj zpráv proti mezipaměti');
}

for (const forbidden of ['<b>Povinný formát:</b>', '<b>Počítání:</b>', '<b>Úplnost:</b>']) {
  if (timerBuilder.includes(forbidden)) throw new Error(`Generátor časovačů stále obsahuje pracovní text: ${forbidden}`);
}
const timerFieldOrder = ['<b>Kdy:</b>', '<b>Komu:</b>', '<b>Pro:</b>', '<b>Č. j. / sp. zn.:</b>', '<b>Kdo:</b>', '<b>Co se stalo:</b>'];
const routedTimerStart = home.indexOf('data-timer-id="timer-admin-nsz-odvolani-sin55-2026"');
const routedTimerEnd = home.indexOf('</article>', routedTimerStart);
const routedTimer = routedTimerStart >= 0 && routedTimerEnd > routedTimerStart
  ? home.slice(routedTimerStart, routedTimerEnd)
  : '';
let previousTimerField = -1;
for (const field of timerFieldOrder) {
  const position = routedTimer.indexOf(field);
  if (position < 0 || position <= previousTimerField) throw new Error(`Nesprávné pořadí údajů časovače u pole ${field}`);
  previousTimerField = position;
}

const publicWorkingPhrases = [
  'Povinný formát:', 'Počítání:', 'Úplnost:',
  'chybějící karta zastaví build', 'build kontroluje úplnost',
  'právně kvalifikovaný override',
  'Položka je odvozena automaticky z kanonického registru',
  'Podání je v kanonickém registru vedeno jako'
];
const publicFiles = (await readdir('web', { recursive: true })).filter(path => path.endsWith('.html'));
for (const path of publicFiles) {
  const html = await readFile(`web/${path}`, 'utf8');
  if (html.includes('</head>') && html.includes('</body>')
    && (!html.includes('auto-translate.js') || !html.includes('language-menu.css'))) {
    throw new Error(`Veřejná stránka web/${path} nemá společnou jazykovou nabídku`);
  }
  for (const phrase of publicWorkingPhrases) {
    if (html.includes(phrase)) throw new Error(`Ve veřejném souboru web/${path} zůstal pracovní text: ${phrase}`);
  }
}

const englishGodotRecords = (englishGodot.match(/data-document-id="doc-/g) || []).length;
const englishGodotOutgoing = (englishGodot.match(/data-outgoing-id="/g) || []).length;
if (!englishGodot.includes('data-english-chronology-count="67"') || englishGodotRecords !== 67) {
  throw new Error(`Anglický Godot nemá úplných 67 záznamů: ${englishGodotRecords}`);
}
if (englishGodotOutgoing !== 10) throw new Error(`Anglický Godot nemá všech 10 navazujících podání: ${englishGodotOutgoing}`);
for (const field of ['Date:', 'From:', 'Reference:', 'What happened:', 'To:', 'For:']) {
  if (!englishGodot.includes(`<b>${field}</b>`)) throw new Error(`Anglickému Godotu chybí pole ${field}`);
}
for (const czechField of ['Datum:', 'Kdo:', 'Č. j. / sp. zn.:', 'Co se stalo:']) {
  if (englishGodot.includes(`<b>${czechField}</b>`)) throw new Error(`V anglickém Godotu zůstalo české pole ${czechField}`);
}

console.log(`Smlouva titulní stránky: 3 lišty; ${caseRows.length} soudních řízení chronologicky; olejově modrá #285b6f; bílé písmo včetně časovačů; mobilní skládání; důkazní přepážka přes celou stránku.`);
