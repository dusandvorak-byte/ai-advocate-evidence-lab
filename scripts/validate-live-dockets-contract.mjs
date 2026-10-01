import { readFile, readdir } from 'node:fs/promises';

const script = await readFile('web/live-dockets.js', 'utf8');
const styles = await readFile('web/home-rollups.css', 'utf8');
const home = await readFile('web/index.html', 'utf8');
const englishHome = await readFile('web/en.html', 'utf8');
const newsFeed = await readFile('web/news-feed.js', 'utf8');
const siteSearch = await readFile('web/site-search.js', 'utf8');
const publishWorkflow = await readFile('.github/workflows/publish-gh-pages-branch.yml', 'utf8');
const timerBuilder = await readFile('scripts/build-process-timers.mjs', 'utf8');
const englishGodot = await readFile('web/news/04082026-010.html', 'utf8');
const canonicalDocuments = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8'));
const automaticTranslation = await readFile('web/auto-translate.js', 'utf8');
const churchCzPage = await readFile('web/kc/index.html', 'utf8');
const churchEnPage = await readFile('web/kc/en.html', 'utf8');

const requiredBars = [
  'Godot online → každá zpráva má zdroj',
  'Aktivní soudní řízení od 1. května 2026',
  'justicni-slalom'
];
for (const label of requiredBars) {
  if (!script.includes(label)) throw new Error(`Chybí hlavní lišta: ${label}`);
}
for (const obsolete of ['Předžalobní řízení on-line od 1. května 2026', 'Státní láska online od 1. května 2026']) {
  if (script.includes(obsolete)) throw new Error(`Vrátila se zrušená lišta: ${obsolete}`);
}

const caseRows = [...script.matchAll(/\['(\d{4}-\d{2}-\d{2})',\s*'([^']+)',\s*[^\]]+\]/g)]
  .map(([, date, label]) => ({ date, label }));
if (caseRows.length !== 11) throw new Error(`Očekáváno jedenáct soudních řízení, nalezeno ${caseRows.length}`);
for (const abbreviation of ['MS v Praze', 'OS Praha 4', 'OS Prostějov', 'OS Ostrava', 'vratka VS']) {
  if (caseRows.some(item => item.label.includes(abbreviation))) throw new Error(`V názvu aktivního soudního řízení zůstala zkratka: ${abbreviation}`);
}
for (const fullName of ['Městský soud v Praze', 'Obvodní soud pro Prahu 4', 'Okresní soud v Prostějově', 'Krajský soud v Ostravě', 'Krajský soud v Brně', 'Nejvyšší správní soud', 'Vrchním soudem v Praze']) {
  if (!caseRows.some(item => item.label.includes(fullName))) throw new Error(`V aktivních soudních řízeních chybí celý název: ${fullName}`);
}
for (const fullName of ['Prague Municipal Court', 'Prague 4 District Court', 'Prostějov District Court', 'Ostrava Regional Court', 'Brno Regional Court', 'Supreme Administrative Court', 'Prague High Court']) {
  if (!script.includes(fullName)) throw new Error(`V anglických aktivních soudních řízeních chybí celý název: ${fullName}`);
}
for (let index = 1; index < caseRows.length; index += 1) {
  if (caseRows[index - 1].date > caseRows[index].date) {
    throw new Error(`Soudní řízení nejsou chronologicky: ${caseRows[index - 1].label} → ${caseRows[index].label}`);
  }
}
if (!script.includes('link.dataset.startDate = startDate')) throw new Error('Soudní odkazy nemají veřejně kontrolovatelné datum počátku');

for (const declaration of ['background: #285b6f;', 'color: #fff;']) {
  if (!styles.includes(declaration)) throw new Error(`Chybí barevná smlouva lišt: ${declaration}`);
}
if (!await readFile('web/justice-slalom.css', 'utf8').then(css => css.includes('background:#285b6f'))) throw new Error('Rozbalovací lišta nemá tmavě modrý kontrast');

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
const reportFiles = (await readdir('web/zpravy')).filter(name => /^\d{8}-\d+\.html$/.test(name));
const reportDate = name => {
  const match = name.match(/^(\d{2})(\d{2})(\d{4})-(\d+)\.html$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}-${String(match[4]).padStart(6,'0')}` : '';
};
const latestReport = [...reportFiles].sort((a,b) => reportDate(a).localeCompare(reportDate(b))).at(-1);
if (!latestReport) throw new Error('Nelze určit poslední publikovaný článek');
const nowHref = `zpravy/${latestReport}`;
if (!home.includes(`<a href="${nowHref}">Právě teď</a>`)) throw new Error(`Odkaz Právě teď nevede na poslední publikovaný článek ${nowHref}`);
if (home.includes('href="#lhuty">Lhůty</a>') || home.includes('href="#semafor">Ověřit listinu</a>')) throw new Error('První navigační lišta stále obsahuje Lhůty nebo Ověřit listinu');
if (!home.includes('href="#active-court-proceedings">Aktivní soudní řízení od 1. května 2026</a>')) throw new Error('Statický fallback první lišty neobsahuje aktivní soudní řízení');
if (!home.includes('href="#podpora">Podpořit</a>')) throw new Error('První lišta ztratila Podpořit');
if (!script.includes("primaryNav.replaceChildren(nowLink, archiveLink, courtDetails, supportLink)")) throw new Error('Runtime první lišty nepřesouvá aktivní soudní řízení mezi Archiv a Podpořit');
if (!script.includes('https://www.konopijelek.cz/')) throw new Error('Soudní řízení nejsou propojena na Konopí je lék.cz');
const czechGodot = await readFile('web/zpravy/04082026-010.html', 'utf8');
if (!englishHome.includes('<script src="live-dockets.js" defer></script>')) throw new Error('Anglická titulní stránka nenačítá generátor tří lišt');
for (const [label, page] of [['CZ home',home],['EN home',englishHome]]) {
  if (!page.includes('id="justicni-slalom"') || page.includes('data-timer-id="')) throw new Error(`${label}: chybí slalom nebo zůstal veřejný časovač`);
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
if (!styles.includes('#traffic.utility-grid') || !styles.includes('#traffic.utility-grid > .desk')) throw new Error('Anglická důkazní přepážka nemá plnou šířku');
for (const label of ['Godot online → every report has a source', 'Active court proceedings since 1 May 2026', 'justicni-slalom']) {
  if (!script.includes(label)) throw new Error(`Chybí anglická hlavní lišta: ${label}`);
}
for (const id of ['11092026-013','07082026-011','04082026-010','28072026-009','25072026-007','24072026-006','24072026-005','23072026-004','22072026-002','20072026-001']) {
  if (!newsFeed.includes(`hrefEn: 'news/${id}.html'`)) throw new Error(`Zpráva ${id} nemá skutečnou anglickou stránku`);
}
const englishArchive = await readFile('web/news/index.html', 'utf8');
for (const id of ['11092026-013','04082026-010','28072026-009','25072026-007','24072026-006','24072026-005','23072026-004','22072026-002','20072026-001']) {
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

const englishGodotRecords = (englishGodot.match(/<li id="en-doc-[^"]+" data-document-id="doc-/g) || []).length;
const englishGodotOutgoing = (englishGodot.match(/data-outgoing-id="/g) || []).length;
const expectedEnglishDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Prague'
}).format(new Date()).toLocaleUpperCase('en-GB');
if (!englishGodot.includes(`<header class="topline"><span>${expectedEnglishDate}</span>`)) throw new Error('Anglická kanonická chronologie nemá dnešní pražské datum');
const englishGodotDeclaredCount = Number(englishGodot.match(/data-english-chronology-count=\"(\d+)\"/)?.[1] || 0);
if (englishGodotRecords < 1 || englishGodotDeclaredCount !== englishGodotRecords) {
  throw new Error(`Anglický Godot nemá konzistentní počet záznamů: vykresleno ${englishGodotRecords}, deklarováno ${englishGodotDeclaredCount}`);
}
const expectedEnglishOutgoing = canonicalDocuments.documents.filter(item => item.issue_date >= '2026-05-01' && item.submission_side === 'outgoing_from_user_or_alliance').length;
if (englishGodotOutgoing !== expectedEnglishOutgoing) throw new Error(`Anglický Godot nemá všechna kanonická navazující podání: ${englishGodotOutgoing}/${expectedEnglishOutgoing}`);
const chronologyBlock = id => {
  const start = czechGodot.indexOf(`<li id="${id}"`);
  const end = start < 0 ? -1 : czechGodot.indexOf('</li>', start);
  if (start < 0 || end < 0) throw new Error(`Českému Godotu chybí položka ${id}`);
  return czechGodot.slice(start, end);
};
const item13 = chronologyBlock('doc-cz-ct-2026-06-01-ct-338889-2025-38');
const item4 = chronologyBlock('doc-cz-osz-olo-2026-05-12-sin-22-2025-95');
if (!item4.includes('Vyrozumění o zastavení řízení pro nezaplacení částky 6 800 Kč za vydání informací')) throw new Error('Položka 4 nemá úplný důvod zastavení řízení a částku 6 800 Kč');
const item47 = chronologyBlock('doc-cz-osz-pro-2026-07-28-zn-4-2026-6');
const item56 = chronologyBlock('doc-cz-kpr-2026-08-03-kpr-5080-2026');
const item59 = chronologyBlock('doc-eu-euda-2026-08-07-ack-article-265-tfeu');
const item67 = chronologyBlock('doc-cz-pcr-pp-2026-08-14-ppr-43826-2-cj-2026-990210-pd');
const uploadFiles = JSON.parse(await readFile('project-memory/justice-slalom-upload-reconciliation-2026-09-28.json','utf8')).files;
const pdfForId = id => {
  const pdf = canonicalDocuments.documents.find(doc => doc.id === id)?.public?.pdf;
  if (!pdf) throw new Error(`Kanonickému záznamu chybí PDF: ${id}`);
  return pdf;
};
const pdfForUpload = number => {
  const id = uploadFiles.find(file => file.number === number)?.document_id;
  if (!id) throw new Error(`Chybí inventura podání ${number}`);
  return pdfForId(id);
};
const hasPdf = (block,pdf,label) => {
  if (!block.includes(`href="${pdf}"`)) throw new Error(`${label} chybí aktivní kanonické PDF: ${pdf}`);
};
hasPdf(item13,pdfForId('doc-cz-ct-2026-06-01-ct-338889-2025-38'),'Položce 13');
hasPdf(item13,pdfForUpload(78),'Položce 13');
if ((item13.match(/Reakce na podání orgánu veřejné moci:/g) || []).length !== 1) throw new Error('Položka 13 nemá právě jednu požadovanou reakci');
hasPdf(item47,pdfForUpload(62),'Položce 47');
for (const number of [11,12]) hasPdf(item56,pdfForUpload(number),'Položce 56');
for (const number of [26,3,33,73,53,28]) hasPdf(item67,pdfForUpload(number),'Položce 67');
hasPdf(item67,pdfForId('doc-cz-dd-2026-08-15-zadost-prezkum-policejni-prezident'),'Položce 67');
if ((item47.match(/Reakce na podání orgánu veřejné moci:/g) || []).length !== 1) throw new Error('Položka 47 nemá právě jednu požadovanou reakci');
if ((item56.match(/Reakce na podání orgánu veřejné moci:/g) || []).length !== 2) throw new Error('Položka 56 nemá právě dvě požadované reakce');
for (const pdf of ['47-citc-formal-call-euda-article-265-tfeu-2026-08-07-en.pdf', '48-citc-formalni-vyzva-euda-cl-265-sfeu-2026-08-07-cs.pdf', '49-dvorak-letter-laura-ramos-cannareporter-euda-2026-08-15.pdf']) {
  if (!item59.includes(pdf)) throw new Error(`Položce 59 chybí aktivní PDF: ${pdf}`);
}
if ((item59.match(/Podání, na které orgán veřejné moci reaguje:/g) || []).length !== 1) throw new Error('Položka 59 nemá právě jednu předchozí výzvu EUDA');
if ((item59.match(/Reakce na podání orgánu veřejné moci:/g) || []).length !== 1) throw new Error('Položka 59 nemá právě jednu následnou reakci');
if ((item67.match(/Reakce na podání orgánu veřejné moci:/g) || []).length !== 7) throw new Error('Položka 67 nemá právě sedm požadovaných reakcí');
if (!item47.includes('<b>Datum:</b>') || item47.indexOf('<b>Datum:</b>') > item47.indexOf('<b>Kdo:</b>')) throw new Error('Chronologie nezačíná polem Datum');
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
for (const field of ['Date:', 'From:', 'Reference:', 'What happened:', 'To:', 'For:']) {
  if (!englishGodot.includes(`<b>${field}</b>`)) throw new Error(`Anglickému Godotu chybí pole ${field}`);
}
for (const czechField of ['Datum:', 'Kdo:', 'Č. j. / sp. zn.:', 'Co se stalo:']) {
  if (englishGodot.includes(`<b>${czechField}</b>`)) throw new Error(`V anglickém Godotu zůstalo české pole ${czechField}`);
}

console.log(`Smlouva titulní stránky: první navigace = Právě teď / Archiv / Aktivní soudy / Podpořit; ${caseRows.length} soudních řízení chronologicky; Godot + Justiční slalom pod navigací; mobilní skládání.`);
