import { readFile, readdir, writeFile } from 'node:fs/promises';

const registry = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8'));
const institutions = JSON.parse(await readFile('project-memory/institutions.json', 'utf8'));
const processTimers = JSON.parse(await readFile('project-memory/process-timers.json', 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('documents-2026.json neobsahuje kanonické dokumenty');
if (!Array.isArray(institutions.institutions)) throw new Error('institutions.json neobsahuje kanonické instituce');

const documents = registry.documents;
const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));
const churchTimer = processTimers.timers?.find(item => item.id === 'timer-admin-mk-2026-07-22');
if (!churchTimer) throw new Error('Chybí kanonický procesní uzel Konopné církve / Ministerstva kultury');
if (churchTimer.status !== 'active_remonstrance_stage' || churchTimer.start_date !== '2026-09-01') {
  throw new Error(`Procesní stav Konopné církve není aktuální: ${churchTimer.status || 'bez statusu'} / ${churchTimer.start_date || 'bez data'}`);
}
const stateRecords = documents.filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record');
const stateCount = stateRecords.length;
const activePdfCount = documents.filter(item => item.public?.pdf).length;
const latestIssueDate = stateRecords.map(item => item.issue_date).sort().at(-1);
if (!latestIssueDate) throw new Error('Registr neobsahuje žádnou státní listinu od 1. května 2026');
const latestStateRecord = [...stateRecords]
  .sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)) || String(a.id).localeCompare(String(b.id)))
  .at(-1);
const latestStateDecisionHref = `zpravy/04082026-010.html#${latestStateRecord.id}`;

const reportFiles = (await readdir('web/zpravy')).filter(name => /^\d{8}-\d+\.html$/.test(name));
const reportDate = name => {
  const match = name.match(/^(\d{2})(\d{2})(\d{4})-(\d+)\.html$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};
const standaloneReportFiles = reportFiles.filter(name => name !== '04082026-010.html');
const latestStandaloneReportFile = [...standaloneReportFiles]
  .sort((a,b) => reportDate(a).localeCompare(reportDate(b)) || a.localeCompare(b))
  .at(-1);
if (!latestStandaloneReportFile) throw new Error('Nelze určit nejnovější samostatný publikovaný článek');
try {
  await readFile(`web/news/${latestStandaloneReportFile}`, 'utf8');
} catch {
  throw new Error(`Nejnovější český článek nemá anglickou protistranu: ${latestStandaloneReportFile}`);
}
const latestStandaloneDate = reportDate(latestStandaloneReportFile);
const godotIsCurrent = latestIssueDate > latestStandaloneDate;
const currentArticleHrefCs = godotIsCurrent ? 'zpravy/04082026-010.html#chronologie' : `zpravy/${latestStandaloneReportFile}`;
const currentArticleHrefEn = godotIsCurrent ? 'news/04082026-010.html#chronologie' : `news/${latestStandaloneReportFile}`;

const courtNavRows = [
  ['2025-07-29','Městský soud v Praze, sp. zn. 45 T 1/2024; po vrácení Vrchním soudem v Praze, sp. zn. 11 To 88/2024','Prague Municipal Court, case 45 T 1/2024; after remittal by the Prague High Court, case 11 To 88/2024','case-cz-ms-praha-45t1-2024'],
  ['2026-05-01','Městský soud v Praze, sp. zn. 18 A 17/2026 – zásahová žaloba proti NCOZ','Prague Municipal Court, case 18 A 17/2026 – intervention action against NCOZ','case-cz-ms-praha-18a17-2026'],
  ['2026-06-04','Obvodní soud pro Prahu 4, sp. zn. 10 C 69/2026 – Česká televize','Prague 4 District Court, case 10 C 69/2026 – Czech Television','case-cz-os-praha4-10c69-2026'],
  ['2026-06-15','Městský soud v Praze, sp. zn. 18 A 23/2026 – zásahová žaloba proti Ministerstvu spravedlnosti','Prague Municipal Court, case 18 A 23/2026 – intervention action against the Ministry of Justice','case-cz-ms-praha-18a23-2026'],
  ['2026-07-12','Okresní soud v Prostějově, sp. zn. 2 T 104/2010 / 15 Nt 3104/2026 – návrh na obnovu řízení','Prostějov District Court, case 2 T 104/2010 / 15 Nt 3104/2026 – application to reopen proceedings','case-cz-os-pro-2t104-2010-obnova'],
  ['2026-07-12','Okresní soud v Prostějově, sp. zn. 2 T 65/2011 / 15 Nt 3106/2026 – návrh na obnovu řízení','Prostějov District Court, case 2 T 65/2011 / 15 Nt 3106/2026 – application to reopen proceedings','case-cz-os-pro-2t65-2011-obnova'],
  ['2026-08-24','Krajský soud v Ostravě, sp. zn. 5 To 248/2026; původní věc Okresního soudu v Ostravě, sp. zn. 15 T 11/2025','Ostrava Regional Court, case 5 To 248/2026; original Ostrava District Court case 15 T 11/2025','case-cz-os-ostrava-15t11-2025'],
  ['2026-08-31','Městský soud v Praze, sp. zn. 15 Ad 14/2026 – žaloba proti SÚKL; předchozí věc proti Ministerstvu zdravotnictví sp. zn. 8 Ad 9/2026','Prague Municipal Court, case 15 Ad 14/2026 – action against SÚKL; previous Ministry of Health case 8 Ad 9/2026','chronologie'],
  ['2026-09-01','Nejvyšší správní soud, sp. zn. 6 As 207/2026 – kasační stížnost; navazuje na Městský soud v Praze, sp. zn. 15 A 44/2026','Supreme Administrative Court, case 6 As 207/2026 – cassation complaint; following Prague Municipal Court case 15 A 44/2026','case-cz-ms-praha-15a44-2026'],
  ['2026-09-03','Krajský soud v Brně, sp. zn. 9 To 315/2026 a 9 To 316/2026 – rozhodnuto 3. 9. 2026; připravována ústavní stížnost','Brno Regional Court, cases 9 To 315/2026 and 9 To 316/2026 – decided 3 September 2026; constitutional complaint in preparation','chronologie']
].sort(([a],[b]) => a.localeCompare(b));

function courtNavigation(lang) {
  const en = lang === 'en';
  const godot = en ? 'news/04082026-010.html' : 'zpravy/04082026-010.html';
  const summary = en
    ? 'Active court proceedings since 1 May 2026'
    : 'Aktivní soudní řízení od 1. května 2026';
  const prompt = en ? 'read as an investigation with love →' : 'číst jako investigativu s láskou →';
  const action = en ? 'Expand →' : 'Rozbalit →';
  const sourceText = en
    ? 'All actions against state authorities and applications to reopen proceedings are available for download in the header of Cannabis is The Cure.cz.'
    : 'Všechny žaloby na státní orgány a návrhy na obnovu řízení jsou uvedeny v záhlaví webových stránek Konopí je lék.cz ke stažení.';
  const sourceLabel = en ? 'Cannabis is The Cure.cz →' : 'Konopí je lék.cz →';
  const items = courtNavRows.map(([date,cs,enLabel,anchor]) => `<div class="nav-court-item" data-start-date="${date}"><a href="${godot}#${anchor}">${escapeHtml(en ? enLabel : cs)}</a><span class="court-download-note">${escapeHtml(sourceText)} <a href="https://www.konopijelek.cz/" target="_blank" rel="noopener">${escapeHtml(sourceLabel)}</a></span></div>`).join('');
  return `<details class="nav-courts" id="active-court-proceedings"><summary><span class="nav-courts-title">${summary}</span><span class="nav-courts-prompt">${prompt}</span><span aria-hidden="true">❤️</span><b>${action}</b></summary><div class="nav-courts-panel">${items}</div></details>`;
}

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');
const formatCzDate = value => {
  const [year, month, day] = String(value).split('-');
  return `${Number(day)}. ${Number(month)}. ${year}`;
};
const formatEnDate = value => {
  const [year, month, day] = String(value).split('-');
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${year}-${month}-01T00:00:00Z`));
  return `${Number(day)} ${monthName} ${year}`;
};

const now = new Date();
const czDisplayDate = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Prague'
}).format(now).toLocaleUpperCase('cs-CZ');
const enDisplayDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Prague'
}).format(now).toLocaleUpperCase('en-GB');
const latest = new Date(`${latestIssueDate}T00:00:00Z`);
const czMonths = ['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince'];
const latestCz = `${latest.getUTCDate()}. ${czMonths[latest.getUTCMonth()]} ${latest.getUTCFullYear()}`;
const latestEn = formatEnDate(latestIssueDate);

const latestPriority = new Map([
  ['doc-cz-mk-2026-08-12-mk-49467-2026-socns', 0],
  ['doc-cz-kpr-2026-08-12-4873-2026', 1],
  ['doc-cz-mv-2026-08-11-mv-127234-2-obp-2026', 2]
]);
const latestRecords = [...stateRecords]
  .sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date))
    || (latestPriority.get(a.id) ?? 999) - (latestPriority.get(b.id) ?? 999)
    || String(a.id).localeCompare(String(b.id)))
  .slice(0, 3);

const localizedCopy = {
  cs: {
    'doc-cz-mk-2026-08-12-mk-49467-2026-socns': 'Ministerstvo kultury potvrdilo, že nové řízení o registraci Konopné církve bylo zahájeno 26. června 2026.',
    'doc-cz-kpr-2026-08-12-4873-2026': 'KPR odmítla poskytnout součinnost při záměru vyvěsit konopnou standartu nad Pražským hradem.',
    'doc-cz-mv-2026-08-11-mv-127234-2-obp-2026': 'Ministerstvo vnitra odmítlo žádost Ganja For All Animals, z.s., podle § 11b informačního zákona.'
  },
  en: {
    'doc-cz-pcr-pp-2026-08-14-ppr-43826-2-cj-2026-990210-pd': 'The Police Presidium’s Internal Control Office declared that it lacked subject-matter jurisdiction over the complaint concerning inactivity by the Institute of Criminalistics and transferred it to the office of the Institute’s director.',
    'doc-cz-mk-2026-08-12-mk-49467-2026-socns': 'The Ministry of Culture confirmed that the new registration proceeding for the Church of Cannabis began on 26 June 2026.',
    'doc-cz-kpr-2026-08-12-4873-2026': 'The Office of the President declined to assist with the plan to fly a cannabis standard above Prague Castle.',
    'doc-cz-mv-2026-08-11-mv-127234-2-obp-2026': 'The Ministry of the Interior refused the information request filed by Ganja For All Animals under Section 11b of the Czech Freedom of Information Act.'
  }
};
const englishInstitutionNames = new Map([
  ['CZ-PCR-PP', 'Police Presidium of the Czech Republic'],
  ['CZ-MK', 'Ministry of Culture'],
  ['CZ-KPR', 'Office of the President of the Republic']
]);

function detailHref(item) {
  return publicPath(item.public?.html || `listiny/${item.id}.html`);
}

function institutionName(item, lang) {
  const institution = institutionMap.get(item.institution_id) || {};
  if (lang === 'en') return englishInstitutionNames.get(item.institution_id) || institution.name_en || institution.name || institution.name_cs || item.institution_id;
  return institution.name_cs || institution.name || item.institution_id;
}

function latestSection(lang) {
  const isEn = lang === 'en';
  const cards = latestRecords.map(item => {
    const title = localizedCopy[lang][item.id] || item.user_title;
    const detail = isEn ? `news/04082026-010.html#en-${item.id}` : detailHref(item);
    const pdf = item.public?.pdf ? publicPath(item.public.pdf) : null;
    const pdfLabel = /(?:verejna-kopie|public-copy)\.pdf$/i.test(pdf || '')
      ? (isEn ? 'Anonymised public PDF copy' : 'Anonymizovaná veřejná kopie PDF')
      : (isEn ? 'Original PDF' : 'Originální PDF');
    const pdfControl = pdf
      ? `<a class="latest-record-pdf" href="${escapeHtml(pdf)}" target="_blank" rel="noopener">${pdfLabel}</a>`
      : `<span class="latest-record-pending">${isEn ? 'Evidence page; PDF not yet public' : 'Evidenční stránka; PDF dosud není veřejné'}</span>`;
    return `<article class="latest-record-card" data-document-id="${escapeHtml(item.id)}"><p class="kicker">${escapeHtml(isEn ? formatEnDate(item.issue_date) : formatCzDate(item.issue_date))} · ${escapeHtml(institutionName(item, lang))}</p><h3><a href="${escapeHtml(detail)}"${isEn ? ' hreflang="cs"' : ''}>${escapeHtml(title)}</a></h3><p class="latest-record-reference">${escapeHtml(item.reference || (isEn ? 'No separate reference number' : 'Bez samostatného č. j.'))}</p>${pdfControl}</article>`;
  }).join('');
  return `<section id="latest-records" class="latest-records" aria-label="${isEn ? 'Latest verified records' : 'Nejnovější ověřené listiny'}"><header><p class="section-label">${isEn ? 'LATEST VERIFIED RECORDS' : 'NEJNOVĚJŠÍ OVĚŘENÉ LISTINY'}</p><h2>${isEn ? `Canonical evidence memory through ${latestEn}` : `Kanonická důkazní paměť do ${latestCz}`}</h2><p>${isEn ? `${stateCount} state and public-institution records and ${activePdfCount} verified public PDFs are synchronized across all public surfaces.` : `${stateCount} listin státu a veřejných institucí je synchronizováno na všech veřejných plochách.`}</p></header><div class="latest-record-grid">${cards}</div></section>`;
}

function removeSectionById(html, id) {
  const marker = `id="${id}"`;
  const markerPos = html.indexOf(marker);
  if (markerPos === -1) return html;
  const start = html.lastIndexOf('<section', markerPos);
  if (start === -1) throw new Error(`Blok ${id} nemá počáteční <section>`);
  const token = /<section\b|<\/section>/g;
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    if (match[0].startsWith('<section')) depth += 1;
    else depth -= 1;
    if (depth === 0) return html.slice(0, start) + html.slice(token.lastIndex);
  }
  throw new Error(`Blok ${id} nemá uzavírací </section>`);
}

function insertLatestAtMainStart(html, lang) {
  html = removeSectionById(html, 'latest-records');
  const main = /<main(?:\s[^>]*)?>/;
  if (!main.test(html)) throw new Error('Veřejná plocha nemá element <main>');
  return html.replace(main, match => `${match}${latestSection(lang)}`);
}

const update = async (path, transforms, lang, insertLatest = true) => {
  let html = await readFile(path, 'utf8');
  if (path.startsWith('web/kc/')) {
    html = html.replace(/<base\b[^>]*>/g, '');
    html = html.replace('<head>', '<head><base href="../">');
  }
  for (const [pattern, replacement, label, optional = false] of transforms) {
    if (!pattern.test(html)) {
      if (optional) continue;
      throw new Error(`${path}: nenalezen synchronizační bod ${label}`);
    }
    html = html.replace(pattern, replacement);
  }
  if (insertLatest) {
    if (!/href="(?:\/ai-advocate-evidence-lab\/)?latest-records\.css"/.test(html)) {
      html = html.replace('</head>', '<link rel="stylesheet" href="latest-records.css"></head>');
    }
    html = insertLatestAtMainStart(html, lang);
  }
  if (!/src="(?:\/ai-advocate-evidence-lab\/)?auto-translate\.js(?:\?v=[^"]*)?"/.test(html)) html = html.replace('</body>', '<script src="auto-translate.js" defer></script></body>');
  if (path.startsWith('web/kc/')) {
    html = html.replace('<base href="../">', '<base data-church-root="../">');
    html = html.replace(/\b(href|src)="(?!https?:|\/|#|mailto:)([^"]+)"/g, '$1="/ai-advocate-evidence-lab/$2"');
    html = html.replace('<base data-church-root="../">', '<base href="../">');
  }
  await writeFile(path, html, 'utf8');
};

await update('web/index.html', [
  [/data-current-date>[^<]+</, `data-current-date>${czDisplayDate}<`, 'jediné veřejné datum'],
  [/<span>Aktualizováno [^<]+<\/span>/i, '', 'duplicitní datum aktualizace', true],
  [/<a href="(?:#prave-ted|zpravy\/04082026-010\.html#[^"]+)">Právě teď<\/a>/, `<a href="${latestStateDecisionHref}">Právě teď</a>`, 'odkaz Právě teď na poslední rozhodnutí státu']
], 'cs');

await update('web/en.html', [
  [/data-current-date>[^<]+</, `data-current-date>${enDisplayDate}<`, 'datum'],
  [/<span>Updated [^<]+<\/span>/i, '', 'duplicitní datum aktualizace', true]
], 'en');

// Kanonická první lišta CannaInsider: nejnovější článek, archiv, soudy, podpora.
// Lhůty a ověřování listin se dočasně z veřejné navigace odstraňují.
{
  const navs = [
    ['web/index.html', `<nav class="nav"><a data-nav-current-article href="${currentArticleHrefCs}">Právě teď</a><a href="zpravy/index.html">Archiv zpráv</a>${courtNavigation('cs')}<a href="#podpora">Podpořit</a></nav>`],
    ['web/en.html', `<nav class="nav" aria-label="Main sections"><a data-nav-current-article href="${currentArticleHrefEn}">Latest report</a><a href="news/index.html">News archive</a>${courtNavigation('en')}<a href="#support">Support</a></nav>`]
  ];
  for (const [file, nav] of navs) {
    let html = await readFile(file, 'utf8');
    if (!/<nav class="nav"[^>]*>[\s\S]*?<\/nav>/.test(html)) throw new Error(`${file}: chybí hlavní navigace`);
    html = html.replace(/<nav class="nav"[^>]*>[\s\S]*?<\/nav>/, nav);
    await writeFile(file, html, 'utf8');
  }
}

// Anglická titulní stránka musí mít stejnou redakční skladbu jako česká:
// článek → vyhledávač → další zprávy → termíny → důkazní přepážka.
{
  const englishPath = 'web/en.html';
  let html = await readFile(englishPath, 'utf8');
  html = html
    .replace('<a href="#memory">Case memory</a>', '')
    .replace(/<aside class="quick-memory" id="memory">[\s\S]*?<\/aside>/, '')
    .replace('Lorraine Nolan with love. A call for a kiss from the governorate of the Protectorate of Böhmen und Groß Cannabis Mähren', 'Lorraine Nolan with love')
    .replaceAll('href="zpravy/07082026-011.html"', 'href="news/07082026-011.html"')
    .replaceAll('href="zpravy/25072026-007.html"', 'href="news/25072026-007.html"')
    .replaceAll('href="zpravy/24072026-006.html"', 'href="news/24072026-006.html"')
    .replaceAll('href="zpravy/04082026-010.html"', 'href="news/04082026-010.html"')
    .replaceAll('Czech report and sources →', 'Report and controlling sources →')
    .replace('<p class="capability-status">International rollout</p><h3>Language selector</h3><ul><li>English is the international entry.</li><li>Additional languages will be generated from the same canonical content.</li><li>The selector should preserve article/document context.</li></ul>', '<p class="capability-status">Available now</p><h3>Language selector</h3><ul><li>English is the international editorial edition.</li><li>Portuguese and other languages are available through clearly labelled machine translation.</li><li>Czech official records and PDFs remain controlling.</li></ul>');
  if (!html.includes('data-shared-news-feed')) {
    const sharedNews = '<section class="shared-news-feed" aria-labelledby="shared-news-heading-en"><div class="news-section-head"><h2 id="shared-news-heading-en">Further current reports</h2><a href="news/index.html">Chronological archive →</a></div><div class="news-grid" data-shared-news-feed data-exclude-ids="04082026-010 24072026-006"></div></section>';
    if (!html.includes('<section class="deadline-watch"')) throw new Error('web/en.html: chybí bod pro vložení dalších aktuálních zpráv');
    html = html.replace('<section class="deadline-watch"', `${sharedNews}<section class="deadline-watch"`);
  }
  await writeFile(englishPath, html, 'utf8');
}

const churchCzLead = `<article class="lead-story"><div class="story-image"><img src="assets/votruba/write-lawmakers.jpg" alt="Černobílá kresba Jiřího Votruby: ruka zapisuje zprávu"><span>Jiří Votruba</span></div><div class="story-copy"><p class="kicker">ZPRÁVA DNE · PASTÝŘSKÉ LISTY · 15. 8. 2026 · REPORT 15082026-012</p><h1><a href="zpravy/15082026-012.html">Desatero pastýřských listů z Evropy u Ospělova</a></h1><p class="standfirst">Deset pastýřských listů ze dne 15. srpna 2026 k oslavě Nanebevzetí Panny Marie, soudní termíny ve věci 45 T 1/2024 a zachovaná pozvánka na Noc básníků.</p><div class="score score-red"><strong>10/10</strong><span>DESET PASTÝŘSKÝCH LISTŮ · AKTIVNÍ PDF</span></div><div class="facts"><p><b>Priorita církevní stránky:</b> řízení Ministerstva kultury pod sp. zn. MK-S 6893/2026 zůstává v živé paměti a nejnovějších listinách.</p><p><b>Nový článek:</b> všech deset pastýřských listů je propojeno s úplným PDF.</p></div></div></article>`;
const churchCzRail = `<aside class="news-rail"><p class="section-label">AKTUÁLNÍ DŮKAZNÍ SÍŤ</p><article><p class="kicker">MINISTERSTVO KULTURY · 31. SRPNA 2026</p><h2><a href="zpravy/04082026-010.html#procesni-casovace">MK 53547/2026 SOCNS + MK 53559/2026 SOCNS</a></h2><p>Zastavení nového řízení a souběžné odpovědi ministerstva; oba akty navazují na sp. zn. MK-S 6893/2026 SOCNS.</p></article><article><p class="kicker">ROZKLAD · 1. ZÁŘÍ 2026</p><h2><a href="zpravy/04082026-010.html#procesni-casovace">Aktivní rozkladová fáze</a></h2><p>Rozklad proti usnesení MK 53547/2026 SOCNS byl podán a doručen 1. září 2026; předchozí obecný časovač byl ukončen.</p></article></aside>`;
const churchCzNodes = `<div class="node-grid"><article><span>MINISTERSTVO KULTURY</span><h3>MK 49467/2026 SOCNS</h3></article><article><span>KPR</span><h3>4873/2026 · konopná standarta</h3></article><article><span>GODOT ONLINE</span><h3>${stateCount} státních a veřejných listin</h3></article></div>`;

await update('web/kc/index.html', [
  [/(<header class="topline"><span>)[^<]+/, `$1${czDisplayDate}`, 'datum'],
  [/<section class="newsroom-alert" id="zive">[\s\S]*?<\/section>/, `<section class="newsroom-alert" id="zive"><b>ŽIVÁ PAMĚŤ CÍRKVE</b><span>Ministerstvo kultury dne 31. srpna 2026 usnesením MK 53547/2026 SOCNS zastavilo nové řízení a současně vydalo sdělení MK 53559/2026 SOCNS. Dne 1. září 2026 byl podán rozklad; aktivní je nyní rozkladová fáze podle § 152 správního řádu.</span><a href="zpravy/04082026-010.html#procesni-casovace">Otevřít aktuální procesní řetězec →</a></section>`, 'aktuální církevní zpráva'],
  [/<article class="lead-story">[\s\S]*?<\/article>/, churchCzLead, 'hlavní církevní zpráva'],
  [/<aside class="news-rail">[\s\S]*?<\/aside>/, churchCzRail, 'církevní důkazní síť'],
  [/<div class="node-grid">[\s\S]*?<\/div>/, churchCzNodes, 'církevní uzly']
], 'cs');

// Kanonická česká chronologie je živá veřejná plocha, proto její horní datum
// musí odpovídat témuž pražskému kalendářnímu dni jako titulní a církevní weby.
{
  const godotPath = 'web/zpravy/04082026-010.html';
  let html = await readFile(godotPath, 'utf8');
  html = html.replace(/(<header class="topline">\s*<span>)[^<]+/, `$1${czDisplayDate}`);
  await writeFile(godotPath, html, 'utf8');
}

const churchEnLead = `<article class="lead-story"><div class="story-image"><img src="assets/votruba/write-lawmakers.jpg" alt="Black-and-white drawing by Jiří Votruba: a hand writing a report"><span>Jiří Votruba</span></div><div class="story-copy"><p class="kicker">STORY OF THE DAY · PASTORAL LETTERS · 15 AUGUST 2026 · REPORT 15082026-012</p><h1><a href="news/15082026-012.html">Ten pastoral letters from Europe near Ospělov</a></h1><p class="standfirst">Ten pastoral letters celebrating the Assumption on 15 August 2026, hearing dates in case 45 T 1/2024 and the preserved invitation to the Night of Poets.</p><div class="score score-red"><strong>10/10</strong><span>TEN PASTORAL LETTERS · ACTIVE PDF LINKS</span></div><div class="facts"><p><b>Church priority:</b> the Ministry of Culture proceeding under file MK-S 6893/2026 remains prominent in the live record and latest verified records.</p><p><b>New report:</b> all ten pastoral letters are linked to their complete PDFs.</p></div></div></article>`;
const churchEnRail = `<aside class="news-rail"><p class="section-label">CURRENT EVIDENCE NETWORK</p><article><p class="kicker">MINISTRY OF CULTURE · 31 AUGUST 2026</p><h2><a href="news/04082026-010.html#chronology">MK 53547/2026 SOCNS + MK 53559/2026 SOCNS</a></h2><p>The Ministry stopped the new proceeding and issued its parallel answers under file MK-S 6893/2026 SOCNS. <a href="/ai-advocate-evidence-lab/listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html" hreflang="cs">Earlier formal notice of the proceeding →</a></p></article><article><p class="kicker">REMONSTRANCE · 1 SEPTEMBER 2026</p><h2><a href="news/04082026-010.html#chronology">Active remonstrance stage</a></h2><p>The remonstrance against order MK 53547/2026 SOCNS was filed and delivered on 1 September 2026; the previous general timer is no longer active.</p></article></aside>`;
const churchEnNodes = `<div class="node-grid"><article><span>MINISTRY OF CULTURE</span><h3>MK 49467/2026 SOCNS</h3></article><article><span>OFFICE OF THE PRESIDENT</span><h3>4873/2026 · cannabis standard</h3></article><article><span>GODOT ONLINE</span><h3>${stateCount} state and public-institution records</h3></article></div>`;

await update('web/kc/en.html', [
  [/(<header class="topline"><span>)[^<]+/, `$1${enDisplayDate}`, 'datum'],
  [/<section class="newsroom-alert" id="live">[\s\S]*?<\/section>/, `<section class="newsroom-alert" id="live"><b>LIVE CHURCH RECORD</b><span>On 31 August 2026, the Ministry of Culture stopped the new proceeding by order MK 53547/2026 SOCNS and issued statement MK 53559/2026 SOCNS. A remonstrance was filed on 1 September 2026; the active stage is now the remonstrance procedure under Section 152 of the Administrative Procedure Code.</span><a href="news/04082026-010.html#chronology">Open the current procedural chain →</a></section>`, 'aktuální mezinárodní církevní zpráva'],
  [/<article class="lead-story">[\s\S]*?<\/article>/, churchEnLead, 'hlavní mezinárodní církevní zpráva'],
  [/<aside class="news-rail">[\s\S]*?<\/aside>/, churchEnRail, 'mezinárodní církevní důkazní síť'],
  [/<div class="node-grid">[\s\S]*?<\/div>/, churchEnNodes, 'mezinárodní církevní uzly']
], 'en');

await update('web/news/index.html', [
  [/(<a href="(?:news|zpravy)\/04082026-010\.html"[^>]*>A time for the state to love<\/a><\/h2><p>)[^<]+/, `$1Czech canonical report: a living chronology of ${stateCount} state and public-institution records through ${latestEn}, with linked responses and source PDFs.`, 'Godot v anglickém archivu']
], 'en', false);

await update('web/zpravy/index.html', [
  [/(<a href="zpravy\/04082026-010\.html">Státu lásky čas<\/a><\/h2><p>)[^<]+/, `$1Živá chronologie ${stateCount} listin státu a veřejných institucí od 1. května do ${latestCz}, s propojenými reakcemi a zdrojovými PDF.`, 'Godot v českém archivu']
], 'cs', false);

// Viditelné propojení sesterských veřejných ploch.
const sisterFooters = [
  ['web/index.html', '<p class="sister-sites">Propojené weby: <a href="/ai-advocate-evidence-lab/kc/index.html">Konopná církev</a> · <a href="https://www.konopijelek.cz/" target="_blank" rel="noopener">Konopí je lék.cz</a></p>'],
  ['web/en.html', '<p class="sister-sites">Connected sites: <a href="/ai-advocate-evidence-lab/kc/en.html">Church of Cannabis</a> · <a href="https://www.konopijelek.cz/" target="_blank" rel="noopener">Konopí je lék.cz</a></p>'],
  ['web/kc/index.html', '<p class="sister-sites">Propojené weby: <a href="/ai-advocate-evidence-lab/index.html">CannaInsider.EU</a> · <a href="https://www.konopijelek.cz/" target="_blank" rel="noopener">Konopí je lék.cz</a></p>'],
  ['web/kc/en.html', '<p class="sister-sites">Connected sites: <a href="/ai-advocate-evidence-lab/en.html">CannaInsider.EU</a> · <a href="https://www.konopijelek.cz/" target="_blank" rel="noopener">Konopí je lék.cz</a></p>']
];
for (const [file, links] of sisterFooters) {
  let html = await readFile(file, 'utf8');
  html = html.replace(/<p class="sister-sites">[\s\S]*?<\/p>/g, '');
  if (!html.includes('</footer>')) throw new Error(`${file}: chybí footer pro propojení sesterských webů`);
  html = html.replace('</footer>', `${links}</footer>`);
  await writeFile(file, html, 'utf8');
}

const surfaces = [
  ['CannaInsider CZ', 'web/index.html'],
  ['CannaInsider international', 'web/en.html'],
  ['Konopná církev CZ', 'web/kc/index.html'],
  ['Church of Cannabis international', 'web/kc/en.html']
];

for (const [label, path] of surfaces) {
  const html = await readFile(path, 'utf8');
  for (const stylesheet of ['styles.css', 'brand.css', 'latest-records.css']) {
    if (!new RegExp(`href="(?:/ai-advocate-evidence-lab/)?${stylesheet.replace('.', '\\.')}"`).test(html)) throw new Error(`${label}: chybí společný ${stylesheet}`);
  }
  if (!html.includes('class="topline"') || !html.includes('class="masthead"') || !html.includes('class="nav"')) {
    throw new Error(`${label}: chybí společná rámová komponenta`);
  }
  if (!html.includes('id="latest-records"')) throw new Error(`${label}: chybí synchronizovaný blok nejnovějších listin`);
  for (const item of latestRecords) {
    if (!html.includes(`data-document-id="${item.id}"`)) throw new Error(`${label}: chybí nejnovější listina ${item.id}`);
  }
}

for (const path of ['web/en.html', 'web/kc/en.html']) {
  let html = await readFile(path, 'utf8');
  if (path === 'web/en.html' && !html.includes('src="live-dockets.js"')) {
    html = html.replace('</body>', '<script src="live-dockets.js" defer></script></body>');
    await writeFile(path, html, 'utf8');
  }
  if (!html.includes(`${stateCount} state and public-institution records`) || !html.includes(`${activePdfCount} verified public PDFs`)) {
    throw new Error(`${path}: anglická plocha není synchronizována s kanonickými počty`);
  }
}

const czHome = await readFile('web/index.html', 'utf8');
if (/Aktualizováno\s+\d/i.test(czHome)) throw new Error('Titulní stránka obsahuje zakázaný duplicitní údaj Aktualizováno');
if (!czHome.includes(`data-current-date>${czDisplayDate}<`)) throw new Error('Titulní stránka nemá dnešní kanonické datum');
const churchCz = await readFile('web/kc/index.html', 'utf8');
const churchEn = await readFile('web/kc/en.html', 'utf8');
const canonicalCz = await readFile('web/zpravy/04082026-010.html', 'utf8');
if (!churchCz.includes(`<header class="topline"><span>${czDisplayDate}</span>`)) throw new Error('Český web Konopné církve nemá dnešní pražské datum');
if (!churchEn.includes(`<header class="topline"><span>${enDisplayDate}</span>`)) throw new Error('Anglický web Konopné církve nemá dnešní pražské datum');
for (const [label, html] of [['český', churchCz], ['anglický', churchEn]]) {
  if (!html.includes('<base href="../">')) throw new Error(`${label} web Konopné církve nemá společný kořen odkazů`);
  if (html.includes('href="kc/listiny/')) throw new Error(`${label} web Konopné církve obsahuje chybnou cestu kc/listiny`);
  for (const relativeRoot of ['href="listiny/', 'href="news/', 'href="documents/', 'src="assets/', 'href="kc/']) {
    if (html.includes(relativeRoot)) throw new Error(`${label} web Konopné církve obsahuje relativní cestu nevhodnou pro překladač: ${relativeRoot}`);
  }
}
if (!canonicalCz.match(new RegExp(`<header class="topline">\\s*<span>${czDisplayDate.replaceAll('.', '\\.')}</span>`))) throw new Error('Česká kanonická chronologie nemá dnešní pražské datum');
if (churchCz.includes('Ministerstvo kultury dne 12. srpna 2026 formálně potvrdilo zahájení nového řízení')) throw new Error('Česká církevní plocha obsahuje zastaralý srpnový headline');
if (churchEn.includes('On 12 August 2026, the Ministry of Culture formally confirmed')) throw new Error('Anglická církevní plocha obsahuje zastaralý srpnový headline');
if (!churchCz.includes('Dne 1. září 2026 byl podán rozklad')) throw new Error('Česká církevní plocha neobsahuje aktuální rozkladovou fázi');
if (!churchEn.includes('A remonstrance was filed on 1 September 2026')) throw new Error('Anglická církevní plocha neobsahuje aktuální remonstrance stage');

console.log(`Veřejné varianty synchronizovány: ${czDisplayDate}; ${stateCount} státních listin; ${activePdfCount} aktivních PDF; 4/4 plochy obsahují stejné tři nejnovější evidenční záznamy.`);
