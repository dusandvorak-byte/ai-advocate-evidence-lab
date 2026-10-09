import { readFile, readdir } from 'node:fs/promises';

const script = await readFile('web/live-dockets.js', 'utf8');
const styles = await readFile('web/home-rollups.css', 'utf8');
const courtStyles = await readFile('web/live-dockets.css', 'utf8');
const courtRegistry = JSON.parse(await readFile('project-memory/active-court-dockets.json', 'utf8'));
const home = await readFile('web/index.html', 'utf8');
const englishHome = await readFile('web/en.html', 'utf8');
const newsFeed = await readFile('web/news-feed.js', 'utf8');
const siteSearch = await readFile('web/site-search.js', 'utf8');
const publishWorkflow = await readFile('.github/workflows/publish-gh-pages-branch.yml', 'utf8');
const timerBuilder = await readFile('scripts/build-process-timers.mjs', 'utf8');
const englishGodot = await readFile('web/news/04082026-010.html', 'utf8');
const sourceManifest = JSON.parse(await readFile('project-memory/document-sources.json', 'utf8'));
const mergedDocuments = new Map();
for (const source of sourceManifest.sources || []) {
  const payload = JSON.parse(await readFile(source.path, 'utf8'));
  for (const item of payload.documents || []) {
    const previous = mergedDocuments.get(item.id) || {};
    mergedDocuments.set(item.id, { ...previous, ...item, public: { ...(previous.public || {}), ...(item.public || {}) } });
  }
}
const canonicalDocuments = { documents: [...mergedDocuments.values()] };
const stateLoveCount = canonicalDocuments.documents.filter(item =>
  item.issue_date >= '2026-05-01'
  && item.document_type !== 'state_record_attachment'
  && (item.submission_side === 'incoming_from_state_or_public_institution' || item.document_type === 'state_record')
).length;
const automaticTranslation = await readFile('web/auto-translate.js', 'utf8');
const churchCzPage = await readFile('web/kc/index.html', 'utf8');
const churchEnPage = await readFile('web/kc/en.html', 'utf8');
const czechArchive = await readFile('web/zpravy/index.html', 'utf8');
const englishArchive = await readFile('web/news/index.html', 'utf8');
const latestCardIds = page => [...page.matchAll(/class="latest-record-card" data-document-id="([^"]+)"/g)].map(match => match[1]);
const canonicalLatestStateIds = canonicalDocuments.documents
  .filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record')
  .sort((a,b) => String(b.issue_date).localeCompare(String(a.issue_date)) || String(a.id).localeCompare(String(b.id)))
  .slice(0,3)
  .map(item => item.id);
if (canonicalLatestStateIds.length !== 3) throw new Error('Nelze odvodit tři nejnovější kanonické státní/veřejné listiny');
for (const [label, page] of [['CZ home', home], ['EN home', englishHome], ['CZ church', churchCzPage], ['EN church', churchEnPage]]) {
  const ids = latestCardIds(page);
  if (ids.length !== 3 || ids.join('|') !== canonicalLatestStateIds.join('|')) {
    throw new Error(`${label}: nejnovější listiny nejsou dynamicky synchronizované; očekáváno ${canonicalLatestStateIds.join(', ')}, nalezeno ${ids.join(', ')}`);
  }
}
for (const [label, page, lang] of [['CZ home',home,'cs'],['EN home',englishHome,'en'],['CZ church',churchCzPage,'cs'],['EN church',churchEnPage,'en']]) {
  if (!page.includes('justice-slalom-shell state-love-shell') || !page.includes('home-rollup justice-slalom state-love-panel')) {
    throw new Error(`${label}: chybí rozbalovací Godot/State Love panel`);
  }
  if (page.includes('state-love-panel" open')) throw new Error(`${label}: Godot panel je chybně otevřený bez kliknutí`);
  const title = lang === 'en'
    ? "Godot online – decisions of state and public institutions since 1 May 2026. Will the State's time for love come?"
    : 'Godot online – rozhodnutí státních a veřejných institucí od 1. května 2026. Přijde Státu lásky čas?';
  const intro = lang === 'en'
    ? `${stateLoveCount} responses of state love since 1 May 2026 · newest on top · the oldest response is No. 1. Will Godot finally arrive?`
    : `${stateLoveCount} reakcí státní lásky od 1. května 2026 · nejnovější nahoře · nejstarší reakce má číslo 1. Přijde už konečně Godot?`;
  if (!page.includes(title) || !page.includes(intro)) throw new Error(`${label}: titul nebo dynamický úvod Godota není aktuální`);
}

const requiredBars = [
  'Godot online – rozhodnutí státních a veřejných institucí od 1. května 2026. Přijde Státu lásky čas?',
  'Aktivní soudní řízení od 1. května 2026',
  'justicni-slalom'
];
for (const label of requiredBars) {
  if (!script.includes(label)) throw new Error(`Chybí hlavní lišta: ${label}`);
}
if (!script.includes("const stateLoveShell = document.querySelector('.state-love-shell')") || !script.includes('wrapper.append(stateLoveShell)')) {
  throw new Error('Godot online není skutečný rozbalovací State Love panel přesunutý do hlavního stacku');
}
if (script.includes("document.createElement('a')") && script.includes("home-rollup-link godot")) {
  throw new Error('Godot online se vrátil na pouhý odkaz místo rozbalovacího panelu');
}
for (const obsolete of ['Předžalobní řízení on-line od 1. května 2026', 'Státní láska online od 1. května 2026']) {
  if (script.includes(obsolete)) throw new Error(`Vrátila se zrušená lišta: ${obsolete}`);
}

const courtRows = courtRegistry.rows || [];
if (courtRows.length !== 12) throw new Error(`Očekáváno 12 soudních větví, nalezeno ${courtRows.length}`);
if (JSON.stringify(courtRegistry.table_contract?.width_percent) !== '[42,18,18,12,10]') throw new Error('Soudní tabulka nemá šířky 42/18/18/12/10');
for (const row of courtRows) {
  if (!row.merit_cs || row.merit_cs.length < 80) throw new Error(`Chybí meritní anotace: ${row.id}`);
  if (!Array.isArray(row.links) || !row.links.length) throw new Error(`Chybí Vše zveřejněné: ${row.id}`);
  for (const link of row.links) {
    const normalized = String(link.href || '').replace(/\/+$/,'');
    if (normalized === 'https://www.konopijelek.cz') throw new Error(`Obecný odkaz Konopí je lék je zakázán: ${row.id}`);
  }
}
for (const token of [
  "const registryUrl = '/ai-advocate-evidence-lab/data/active-court-dockets.json'",
  "className = 'docket-bar-stack'",
  "className = 'active-courts-table'",
  'wrapper.append(controls, courtShell)',
  'if (stateLoveShell) wrapper.append(stateLoveShell)',
  'if (slalomShell) wrapper.append(slalomShell)'
]) if (!script.includes(token)) throw new Error(`live-dockets.js postrádá nový soudní kontrakt: ${token}`);
for (const token of [
  'position:sticky',
  '.live-dockets .active-courts-table th:nth-child(1){width:42%}',
  '.live-dockets .active-courts-table th:nth-child(2){width:18%}',
  '.live-dockets .active-courts-table th:nth-child(3){width:18%}',
  '.live-dockets .active-courts-table th:nth-child(4){width:12%}',
  '.live-dockets .active-courts-table th:nth-child(5){width:10%}',
  'overflow-x:auto',
  '@media(max-width:720px)'
]) if (!courtStyles.includes(token)) throw new Error(`live-dockets.css postrádá ${token}`);
if (script.includes("source.href = 'https://www.konopijelek.cz/'")) throw new Error('Aktivní soudní řízení se vrátila k obecnému homepage odkazu');
const reportFiles = (await readdir('web/zpravy')).filter(name => /^\d{8}-\d+\.html$/.test(name));
const reportDate = name => {
  const match = name.match(/^(\d{2})(\d{2})(\d{4})-(\d+)\.html$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};
const latestStandalone = reportFiles
  .filter(name => name !== '04082026-010.html')
  .sort((a,b) => reportDate(a).localeCompare(reportDate(b)) || a.localeCompare(b))
  .at(-1);
if (!latestStandalone) throw new Error('Nelze určit poslední samostatný publikovaný článek');
const currentCs = `zpravy/${latestStandalone}`;
const currentEn = `news/${latestStandalone}`;
if (!home.includes('data-nav-current-article') || !home.includes(`href="${currentCs}"`)) throw new Error(`Právě teď nevede na aktuální článek ${currentCs}`);
if (!englishHome.includes(`href="${currentEn}"`)) throw new Error(`Latest report nevede na aktuální článek ${currentEn}`);
for (const [label, page, currentText] of [['CZ archiv', czechArchive, 'Archiv zpráv'], ['EN archive', englishArchive, 'News archive']]) {
  if (!page.includes('class="nav"') || !page.includes('aria-current="page"') || !page.includes(currentText)) throw new Error(`${label}: archiv nemá čitelnou hlavní navigaci s označenou aktuální položkou`);
}

if (newsFeed.includes("latestNav.href") || newsFeed.includes("querySelector('[data-nav-latest-report]')")) throw new Error('Klientský news-feed znovu přepisuje buildem určený odkaz Právě teď');
const czechGodot = await readFile('web/zpravy/04082026-010.html', 'utf8');
const stateLoveTable = (html, id) => {
  const start = html.indexOf(`<table id="${id}"`);
  const end = start < 0 ? -1 : html.indexOf('</table>', start);
  if (start < 0 || end < 0) throw new Error(`Chybí uzavřená tabulka State Love ${id}`);
  return html.slice(start, end + 8);
};
const czechStateLoveTable = stateLoveTable(czechGodot, 'chronologie-seznam');
const englishStateLoveTable = stateLoveTable(englishGodot, 'en-chronology-list');
if (czechStateLoveTable.includes('>Datum</th>') || !czechStateLoveTable.includes('>Dne</th>')) throw new Error('Česká State Love tabulka nemá záhlaví Dne');
if (czechGodot.includes('state-love-panel" open') || englishGodot.includes('state-love-panel" open')) throw new Error('Godot panel musí být ve výchozím stavu sbalený');
if (!englishHome.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Anglická titulní stránka nenačítá generátor tří lišt');
for (const [label, page] of [['CZ home',home],['EN home',englishHome]]) {
  if (!page.includes('id="justicni-slalom"') || page.includes('data-timer-id="')) throw new Error(`${label}: chybí slalom nebo zůstal veřejný časovač`);
}
for (const [label, page, required] of [
  ['CZ CannaInsider', home, ['/ai-advocate-evidence-lab/kc/index.html','https://www.konopijelek.cz/']],
  ['EN CannaInsider', englishHome, ['/ai-advocate-evidence-lab/kc/en.html','https://www.konopijelek.cz/']],
  ['CZ Konopná církev', churchCzPage, ['/ai-advocate-evidence-lab/index.html','https://www.konopijelek.cz/']],
  ['EN Church of Cannabis', churchEnPage, ['/ai-advocate-evidence-lab/en.html','https://www.konopijelek.cz/']]
]) {
  for (const href of required) if (!page.includes(href)) throw new Error(`${label}: chybí propojení ${href}`);
}
for (const page of [home, englishHome]) if (!page.includes('auto-translate.js')) throw new Error('Titulní stránka nemá nabídku automatických překladů');
for (const required of ["['pt', 'Português']", 'Přeložit / Translate', '100+ dalších jazyků / other languages', 'Czech official records and PDFs remain controlling', 'role="dialog"']) {
  if (!automaticTranslation.includes(required)) throw new Error(`Automatickému překladu chybí: ${required}`);
}
if (!automaticTranslation.includes("location.hostname.endsWith('.translate.goog')")) throw new Error('Překladač nezabraňuje vnořenému překladu již přeložené stránky');
if (!automaticTranslation.includes("startsWith('en') ? 'en' : 'cs'")) throw new Error('Překladač neurčuje zdrojový jazyk podle stránky');
if (/link\.target\s*=\s*['_"]blank/.test(automaticTranslation)) throw new Error('Jazykové odkazy stále otevírají další karty');
if (!englishHome.includes('auto-translate.js?v=20260817-1')) throw new Error('Anglická titulní stránka neverzuje překladový skript proti mezipaměti');
for (const [label, page] of [['český', churchCzPage], ['anglický', churchEnPage]]) {
  if (!page.includes('<base href="../">')) throw new Error(`${label} církevní web nemá společný kořen pro články a listiny`);
  if (!page.includes('href="/ai-advocate-evidence-lab/listiny/')) throw new Error(`${label} církevní web nemá absolutní kořenovou cestu k evidenční listině`);
  for (const relativeRoot of ['href="listiny/', 'href="news/', 'href="documents/', 'src="assets/', 'href="kc/']) {
    if (page.includes(relativeRoot)) throw new Error(`${label} církevní web obsahuje relativní cestu nevhodnou pro automatický překlad: ${relativeRoot}`);
  }
}
if (!englishHome.includes('data-shared-news-feed') || !englishHome.includes('Further current reports')) throw new Error('Anglická titulní stránka nemá blok dalších aktuálních zpráv');
if (/href="zpravy\/\d{8}-\d{3}\.html/.test(englishHome)) throw new Error('Anglická titulní stránka stále odkazuje na český článek');
if (englishHome.includes('class="quick-memory"') || englishHome.includes('href="#memory"')) throw new Error('Anglická titulní stránka stále obsahuje zrušený vedlejší blok Case memory');
for (const label of ["Godot online – decisions of state and public institutions since 1 May 2026. Will the State's time for love come?", 'Active court proceedings since 1 May 2026', 'justicni-slalom']) {
  if (!script.includes(label)) throw new Error(`Chybí anglická hlavní lišta: ${label}`);
}
for (const id of ['07082026-011','04082026-010','28072026-009','25072026-007','24072026-006','24072026-005','23072026-004','22072026-002','20072026-001']) {
  if (!newsFeed.includes(`hrefEn: 'news/${id}.html'`)) throw new Error(`Zpráva ${id} nemá skutečnou anglickou stránku`);
}
for (const id of ['04082026-010','28072026-009','25072026-007','24072026-006','24072026-005','23072026-004','22072026-002','20072026-001']) {
  if (!englishArchive.includes(`href="news/${id}.html"`)) throw new Error(`Anglický archiv nevede na anglickou zprávu ${id}`);
  if (englishArchive.includes(`href="zpravy/${id}.html"`)) throw new Error(`Anglický archiv stále vede na českou zprávu ${id}`);
}
if (/href="news\/\d{8}-\d{3}\.html" hreflang="cs"/.test(englishArchive)) throw new Error('Anglický archiv označuje anglický článek jako český');
for (const stale of ['Czech canonical report:', 'Czech authorial report:', 'Czech report with source.']) if (englishArchive.includes(stale)) throw new Error(`Anglický archiv obsahuje zastaralý popis: ${stale}`);
const mergedEnglishReport = await readFile('web/news/23072026-003.html', 'utf8');
if (!mergedEnglishReport.includes('url=/ai-advocate-evidence-lab/news/24072026-005.html')) throw new Error('Sloučený report 23072026-003 nemá anglické přesměrování');
if (newsFeed.includes('item.hrefEn || item.href')) throw new Error('Anglický feed stále dovoluje tichý návrat na český článek');
if (siteSearch.includes('item.hrefEn || item.href')) throw new Error('Anglické vyhledávání stále dovoluje tichý návrat na český článek');
if (!siteSearch.includes('English search requires hrefEn for every published report')) throw new Error('Anglické vyhledávání nekontroluje úplnost anglických odkazů');
if (!publishWorkflow.includes('grep -q "live-dockets.js?v=${version}" /tmp/verified-site/en.html')
  || !publishWorkflow.includes('grep -q "news-feed.js?v=${version}" /tmp/verified-site/en.html')) {
  throw new Error('Workflow neverzuje anglické lišty a anglický zdroj zpráv proti mezipaměti');
}

for (const forbidden of ['<b>Povinný formát:</b>', '<b>Počítání:</b>', '<b>Úplnost:</b>']) {
  if (timerBuilder.includes(forbidden)) throw new Error(`Generátor časovačů stále obsahuje pracovní text: ${forbidden}`);
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

const englishGodotRecords = (englishGodot.match(/<tr id="en-doc-[^"]+" data-document-id="doc-/g) || []).length;
const englishGodotOutgoing = (englishGodot.match(/data-outgoing-id="/g) || []).length;
const expectedEnglishDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Prague'
}).format(new Date()).toLocaleUpperCase('en-GB');
if (!englishGodot.includes(`<header class="topline"><span>${expectedEnglishDate}</span>`)) throw new Error('Anglická kanonická chronologie nemá dnešní pražské datum');
const englishGodotDeclaredCount = Number(englishGodot.match(/data-english-chronology-count=\"(\d+)\"/)?.[1] || 0);
if (englishGodotRecords < 1 || englishGodotDeclaredCount !== englishGodotRecords) {
  throw new Error(`Anglický Godot nemá konzistentní počet záznamů: vykresleno ${englishGodotRecords}, deklarováno ${englishGodotDeclaredCount}`);
}
if (englishGodotOutgoing !== 0) throw new Error(`Anglický Státu lásky čas obsahuje vlastní podání jako hlavní řádek: ${englishGodotOutgoing}`);
for (const header of ['What the authority responded to','Objection / remedy']) {
  if (!englishGodot.includes(`>${header}</th>`)) throw new Error(`Anglickému Státu lásky čas chybí vztahový sloupec ${header}`);
}
const chronologyRow = id => {
  const start = czechGodot.indexOf(`<tr id="${id}"`);
  const end = start < 0 ? -1 : czechGodot.indexOf('</tr>', start);
  if (start < 0 || end < 0) throw new Error(`Českému Godotu chybí tabulkový řádek ${id}`);
  return czechGodot.slice(start, end + 5);
};
const item4 = chronologyRow('doc-cz-osz-olo-2026-05-12-sin-22-2025-95');
if (!item4.includes('Vyrozumění o zastavení řízení pro nezaplacení částky 6 800 Kč za vydání informací')) throw new Error('Tabulková položka nezachovala úplný důvod zastavení řízení a částku 6 800 Kč');

const parseRows = (html, prefix) => [...html.matchAll(new RegExp(`<tr id="${prefix}[^"]+"[^>]*data-row-number="(\\d+)"[^>]*data-issue-date="([^"]+)"[^>]*>`, 'g'))]
  .map(match => ({ number:Number(match[1]), date:match[2] }));
const czRows=parseRows(czechGodot,'doc-');
const enRows=parseRows(englishGodot,'en-doc-');
if (!czRows.length || !enRows.length) throw new Error('Státu lásky čas nemá tabulkové řádky');
for (const rows of [czRows,enRows]) {
  for (let i=0;i<rows.length;i++) {
    if (rows[i].number !== rows.length-i) throw new Error('Číslování Státu lásky čas musí mít nejstarší položku 1 a nejnovější nejvyšší číslo');
    if (i>0 && rows[i-1].date < rows[i].date) throw new Error('Dokumenty Státu lásky čas nejsou vizuálně seřazeny nejnovější nahoře');
  }
  if (rows.at(-1).number!==1) throw new Error('Nejstarší dokument dole nemá číslo 1');
}
if (czRows.length!==enRows.length) throw new Error(`CZ/EN tabulka Státu lásky čas není položkově shodná: ${czRows.length}/${enRows.length}`);

for (const match of englishHome.matchAll(/href="news\/04082026-010\.html#en-([^"]+)"/g)) {
  const outgoingId = match[1];
  if (!englishGodot.includes(`id="en-${outgoingId}"`)) {
    throw new Error(`Anglický časovač vede na chybějící kotvu navazujícího podání: en-${outgoingId}`);
  }
}
if (!czechGodot.includes('id="chronologie"')) throw new Error('Českému Godotovi chybí kanonická kotva chronologie');
for (const match of englishGodot.matchAll(/href="zpravy\/04082026-010\.html#([^"]+)"/g)) {
  const czechAnchor = match[1];
  if (!czechGodot.includes(`id="${czechAnchor}"`)) {
    throw new Error(`Anglický Godot vede na chybějící českou kotvu: ${czechAnchor}`);
  }
}
for (const id of ['case-cz-ms-praha-45t1-2024','case-cz-ms-praha-18a17-2026','case-cz-ms-praha-8ad9-2026','case-cz-os-praha4-10c69-2026','case-cz-ms-praha-18a23-2026','case-cz-os-pro-2t104-2010-obnova','case-cz-os-pro-prevence-2026','case-cz-os-ostrava-15t11-2025','case-cz-ms-praha-15a44-2026']) {
  if (!englishGodot.includes(`id="${id}"`)) throw new Error(`Anglickému Godotu chybí soudní řízení ${id}`);
}
for (const header of ['No.','Date','Authority','Ref./case no.','What happened','What the authority responded to','Objection / remedy']) {
  if (!englishStateLoveTable.includes(`>${header}</th>`)) throw new Error(`Anglickému State Love chybí tabulkový sloupec ${header}`);
}
for (const header of ['Č.','Dne','Orgán','č. j./sp. zn.','Co se stalo','Na co orgán reaguje','Námitka / opravný prostředek']) {
  if (!czechStateLoveTable.includes(`>${header}</th>`)) throw new Error(`Českému State Love chybí tabulkový sloupec ${header}`);
}

console.log(`Smlouva titulní stránky: soudní řízení v první navigační liště; ${caseRows.length} větví chronologicky; Podpořit zachováno; Lhůty a Ověřit listinu odstraněny; Justiční slalom zachován.`);
