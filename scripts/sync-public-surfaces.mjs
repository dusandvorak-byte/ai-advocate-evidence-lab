import { readFile, writeFile } from 'node:fs/promises';

const registry = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8'));
const institutions = JSON.parse(await readFile('project-memory/institutions.json', 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('documents-2026.json neobsahuje kanonické dokumenty');
if (!Array.isArray(institutions.institutions)) throw new Error('institutions.json neobsahuje kanonické instituce');

const documents = registry.documents;
const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));
const stateRecords = documents.filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record');
const stateCount = stateRecords.length;
const activePdfCount = documents.filter(item => item.public?.pdf).length;
const latestIssueDate = stateRecords.map(item => item.issue_date).sort().at(-1);
if (!latestIssueDate) throw new Error('Registr neobsahuje žádnou státní listinu od 1. května 2026');
const latestStateRecord = [...stateRecords]
  .sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)) || String(a.id).localeCompare(String(b.id)))
  .at(-1);
const latestStateDecisionHref = `zpravy/04082026-010.html#${latestStateRecord.id}`;

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
const latestCz = `${latest.getUTCDate()}. srpna ${latest.getUTCFullYear()}`;
const latestEn = `${latest.getUTCDate()} August ${latest.getUTCFullYear()}`;

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
    const pdfControl = pdf
      ? `<a class="latest-record-pdf" href="${escapeHtml(pdf)}" target="_blank" rel="noopener">${isEn ? 'Original PDF' : 'Originální PDF'}</a>`
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
    const sharedNews = '<section class="shared-news-feed" aria-labelledby="shared-news-heading-en"><div class="news-section-head"><h2 id="shared-news-heading-en">Further current reports</h2><a href="news/index.html">Chronological archive →</a></div><div class="news-grid" data-shared-news-feed data-exclude-ids="07082026-011 04082026-010 24072026-006"></div></section>';
    if (!html.includes('<section class="deadline-watch"')) throw new Error('web/en.html: chybí bod pro vložení dalších aktuálních zpráv');
    html = html.replace('<section class="deadline-watch"', `${sharedNews}<section class="deadline-watch"`);
  }
  await writeFile(englishPath, html, 'utf8');
}

const churchCzLead = `<article class="lead-story"><div class="story-image"><img src="assets/votruba/write-lawmakers.jpg" alt="Černobílá kresba Jiřího Votruby: ruka zapisuje zprávu"><span>Jiří Votruba</span></div><div class="story-copy"><p class="kicker">ZPRÁVA DNE · PASTÝŘSKÉ LISTY · 15. 8. 2026 · REPORT 15082026-012</p><h1><a href="zpravy/15082026-012.html">Desatero pastýřských listů z Evropy u Ospělova</a></h1><p class="standfirst">Deset pastýřských listů ze dne 15. srpna 2026 k oslavě Nanebevzetí Panny Marie, soudní termíny ve věci 45 T 1/2024 a zachovaná pozvánka na Noc básníků.</p><div class="score score-red"><strong>9/9</strong><span>DESET PASTÝŘSKÝCH LISTŮ · AKTIVNÍ PDF</span></div><div class="facts"><p><b>Priorita církevní stránky:</b> řízení Ministerstva kultury pod sp. zn. MK-S 6893/2026 zůstává v živé paměti a nejnovějších listinách.</p><p><b>Nový článek:</b> všech deset pastýřských listů je propojeno s úplným PDF.</p></div></div></article>`;
const churchCzRail = `<aside class="news-rail"><p class="section-label">AKTUÁLNÍ DŮKAZNÍ SÍŤ</p><article><p class="kicker">MINISTERSTVO KULTURY · 12. SRPNA 2026</p><h2><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html">MK 49467/2026 SOCNS</a></h2><p>Formální potvrzení nového řízení od 26. června 2026.</p></article><article><p class="kicker">KPR · 12. SRPNA 2026</p><h2><a href="listiny/doc-cz-kpr-2026-08-12-4873-2026.html">Konopná standarta nad Hradem</a></h2><p>KPR odmítla požadovanou součinnost; originální listina je veřejně propojena.</p></article></aside>`;
const churchCzNodes = `<div class="node-grid"><article><span>MINISTERSTVO KULTURY</span><h3>MK 49467/2026 SOCNS</h3></article><article><span>KPR</span><h3>4873/2026 · konopná standarta</h3></article><article><span>GODOT ONLINE</span><h3>${stateCount} státních a veřejných listin</h3></article></div>`;

await update('web/kc/index.html', [
  [/(<header class="topline"><span>)[^<]+/, `$1${czDisplayDate}`, 'datum'],
  [/<section class="newsroom-alert" id="zive">[\s\S]*?<\/section>/, `<section class="newsroom-alert" id="zive"><b>ŽIVÁ PAMĚŤ CÍRKVE</b><span>Ministerstvo kultury dne 12. srpna 2026 formálně potvrdilo zahájení nového řízení již dnem 26. června 2026. Kanonická chronologie obsahuje ${stateCount} státních a veřejných listin.</span><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html">Otevřít evidenční listinu →</a></section>`, 'aktuální církevní zpráva'],
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

const churchEnLead = `<article class="lead-story"><div class="story-image"><img src="assets/votruba/write-lawmakers.jpg" alt="Black-and-white drawing by Jiří Votruba: a hand writing a report"><span>Jiří Votruba</span></div><div class="story-copy"><p class="kicker">STORY OF THE DAY · PASTORAL LETTERS · 15 AUGUST 2026 · REPORT 15082026-012</p><h1><a href="news/15082026-012.html">Ten pastoral letters from Europe near Ospělov</a></h1><p class="standfirst">Ten pastoral letters celebrating the Assumption on 15 August 2026, hearing dates in case 45 T 1/2024 and the preserved invitation to the Night of Poets.</p><div class="score score-red"><strong>9/9</strong><span>TEN PASTORAL LETTERS · ACTIVE PDF LINKS</span></div><div class="facts"><p><b>Church priority:</b> the Ministry of Culture proceeding under file MK-S 6893/2026 remains prominent in the live record and latest verified records.</p><p><b>New report:</b> all ten pastoral letters are linked to their complete PDFs.</p></div></div></article>`;
const churchEnRail = `<aside class="news-rail"><p class="section-label">CURRENT EVIDENCE NETWORK</p><article><p class="kicker">MINISTRY OF CULTURE · 12 AUGUST 2026</p><h2><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html" hreflang="cs">MK 49467/2026 SOCNS</a></h2><p>Formal confirmation that the new proceeding began on 26 June 2026.</p></article><article><p class="kicker">OFFICE OF THE PRESIDENT · 12 AUGUST 2026</p><h2><a href="listiny/doc-cz-kpr-2026-08-12-4873-2026.html" hreflang="cs">Cannabis standard above Prague Castle</a></h2><p>The requested assistance was declined; the original Czech record is publicly linked.</p></article></aside>`;
const churchEnNodes = `<div class="node-grid"><article><span>MINISTRY OF CULTURE</span><h3>MK 49467/2026 SOCNS</h3></article><article><span>OFFICE OF THE PRESIDENT</span><h3>4873/2026 · cannabis standard</h3></article><article><span>GODOT ONLINE</span><h3>${stateCount} state and public-institution records</h3></article></div>`;

await update('web/kc/en.html', [
  [/(<header class="topline"><span>)[^<]+/, `$1${enDisplayDate}`, 'datum'],
  [/<section class="newsroom-alert" id="live">[\s\S]*?<\/section>/, `<section class="newsroom-alert" id="live"><b>LIVE CHURCH RECORD</b><span>On 12 August 2026, the Ministry of Culture formally confirmed that the new proceeding began on 26 June 2026. The canonical chronology contains ${stateCount} state and public-institution records and ${activePdfCount} verified public PDFs.</span><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html" hreflang="cs">Open the Czech evidence record →</a></section>`, 'aktuální mezinárodní církevní zpráva'],
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

console.log(`Veřejné varianty synchronizovány: ${czDisplayDate}; ${stateCount} státních listin; ${activePdfCount} aktivních PDF; 4/4 plochy obsahují stejné tři nejnovější evidenční záznamy.`);
