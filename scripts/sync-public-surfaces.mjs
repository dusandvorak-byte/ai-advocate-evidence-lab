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
const day = now.getUTCDate();
const year = now.getUTCFullYear();
const czDisplayDate = `${day}. SRPNA ${year}`;
const enDisplayDate = `${day} AUGUST ${year}`;
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
    'doc-cz-mk-2026-08-12-mk-49467-2026-socns': 'The Ministry of Culture confirmed that the new registration proceeding for the Church of Cannabis began on 26 June 2026.',
    'doc-cz-kpr-2026-08-12-4873-2026': 'The Office of the President declined to assist with the plan to fly a cannabis standard above Prague Castle.',
    'doc-cz-mv-2026-08-11-mv-127234-2-obp-2026': 'The Ministry of the Interior refused the information request filed by Ganja For All Animals under Section 11b of the Czech Freedom of Information Act.'
  }
};

function detailHref(item) {
  return publicPath(item.public?.html || `listiny/${item.id}.html`);
}

function institutionName(item, lang) {
  const institution = institutionMap.get(item.institution_id) || {};
  if (lang === 'en') return institution.name_en || institution.name || institution.name_cs || item.institution_id;
  return institution.name_cs || institution.name || item.institution_id;
}

function latestSection(lang) {
  const isEn = lang === 'en';
  const cards = latestRecords.map(item => {
    const title = localizedCopy[lang][item.id] || item.user_title;
    const detail = detailHref(item);
    const pdf = item.public?.pdf ? publicPath(item.public.pdf) : null;
    const pdfControl = pdf
      ? `<a class="latest-record-pdf" href="${escapeHtml(pdf)}" target="_blank" rel="noopener">${isEn ? 'Original PDF' : 'Originální PDF'}</a>`
      : `<span class="latest-record-pending">${isEn ? 'Evidence page; PDF not yet public' : 'Evidenční stránka; PDF dosud není veřejné'}</span>`;
    return `<article class="latest-record-card" data-document-id="${escapeHtml(item.id)}"><p class="kicker">${escapeHtml(isEn ? formatEnDate(item.issue_date) : formatCzDate(item.issue_date))} · ${escapeHtml(institutionName(item, lang))}</p><h3><a href="${escapeHtml(detail)}"${isEn ? ' hreflang="cs"' : ''}>${escapeHtml(title)}</a></h3><p class="latest-record-reference">${escapeHtml(item.reference || (isEn ? 'No separate reference number' : 'Bez samostatného č. j.'))}</p>${pdfControl}</article>`;
  }).join('');
  return `<section id="latest-records" class="latest-records" aria-label="${isEn ? 'Latest verified records' : 'Nejnovější ověřené listiny'}"><header><p class="section-label">${isEn ? 'LATEST VERIFIED RECORDS' : 'NEJNOVĚJŠÍ OVĚŘENÉ LISTINY'}</p><h2>${isEn ? `Canonical evidence memory through ${latestEn}` : `Kanonická důkazní paměť do ${latestCz}`}</h2><p>${isEn ? `${stateCount} state and public-institution records are synchronized across all public surfaces.` : `${stateCount} listin státu a veřejných institucí je synchronizováno na všech veřejných plochách.`}</p></header><div class="latest-record-grid">${cards}</div></section>`;
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
  for (const [pattern, replacement, label, optional = false] of transforms) {
    if (!pattern.test(html)) {
      if (optional) continue;
      throw new Error(`${path}: nenalezen synchronizační bod ${label}`);
    }
    html = html.replace(pattern, replacement);
  }
  if (insertLatest) {
    if (!html.includes('href="latest-records.css"')) {
      html = html.replace('</head>', '<link rel="stylesheet" href="latest-records.css"></head>');
    }
    html = insertLatestAtMainStart(html, lang);
  }
  await writeFile(path, html, 'utf8');
};

await update('web/index.html', [
  [/data-current-date>[^<]+</, `data-current-date>${czDisplayDate}<`, 'jediné veřejné datum'],
  [/<span>Aktualizováno [^<]+<\/span>/i, '', 'duplicitní datum aktualizace', true]
], 'cs');

await update('web/en.html', [
  [/data-current-date>[^<]+</, `data-current-date>${enDisplayDate}<`, 'datum'],
  [/<span>Updated [^<]+<\/span>/i, `<span>Updated ${day} August ${year} · ${stateCount} state and public-institution records in the canonical chronology · ${activePdfCount} verified public PDFs</span>`, 'souhrn data a počtu']
], 'en');

const churchCzLead = `<article class="lead-story"><div class="story-image"><img src="assets/konopna-cirkev-logo.jpg" alt="Logo Konopné církve"><span>Konopná církev</span></div><div class="story-copy"><p class="kicker">PASTÝŘSKÉ LISTY · NOVÉ ŘÍZENÍ POTVRZENO 12. 8. 2026</p><h1><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html">Nové řízení Konopné církve je formálně zahájeno od 26. června 2026.</a></h1><p class="standfirst">Ministerstvo kultury vede řízení pod sp. zn. MK-S 6893/2026 a oznámilo oprávněné úřední osoby. KPR současně odmítla součinnost při vyvěšení konopné standarty.</p><div class="score score-red"><strong>9/9</strong><span>ZÁSADNÍ PROCESNÍ LISTINA · AKTIVNÍ ŘÍZENÍ</span></div><div class="facts"><p><b>Ministerstvo kultury:</b> č. j. MK 49467/2026 SOCNS ze dne 12. srpna 2026.</p><p><b>Kancelář prezidenta republiky:</b> č. j. 4873/2026 ze dne 12. srpna 2026; originální PDF je veřejně aktivní.</p></div></div></article>`;
const churchCzRail = `<aside class="news-rail"><p class="section-label">AKTUÁLNÍ DŮKAZNÍ SÍŤ</p><article><p class="kicker">MINISTERSTVO KULTURY · 12. SRPNA 2026</p><h2><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html">MK 49467/2026 SOCNS</a></h2><p>Formální potvrzení nového řízení od 26. června 2026.</p></article><article><p class="kicker">KPR · 12. SRPNA 2026</p><h2><a href="listiny/doc-cz-kpr-2026-08-12-4873-2026.html">Konopná standarta nad Hradem</a></h2><p>KPR odmítla požadovanou součinnost; originální listina je veřejně propojena.</p></article></aside>`;
const churchCzNodes = `<div class="node-grid"><article><span>MINISTERSTVO KULTURY</span><h3>MK 49467/2026 SOCNS</h3></article><article><span>KPR</span><h3>4873/2026 · konopná standarta</h3></article><article><span>GODOT ONLINE</span><h3>${stateCount} státních a veřejných listin</h3></article></div>`;

await update('web/kc/index.html', [
  [/(<header class="topline"><span>)[^<]+/, `$1${czDisplayDate}`, 'datum'],
  [/<section class="newsroom-alert" id="zive">[\s\S]*?<\/section>/, `<section class="newsroom-alert" id="zive"><b>ŽIVÁ PAMĚŤ CÍRKVE</b><span>Ministerstvo kultury dne 12. srpna 2026 formálně potvrdilo zahájení nového řízení již dnem 26. června 2026. Kanonická chronologie obsahuje ${stateCount} státních a veřejných listin.</span><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html">Otevřít evidenční listinu →</a></section>`, 'aktuální církevní zpráva'],
  [/<article class="lead-story">[\s\S]*?<\/article>/, churchCzLead, 'hlavní církevní zpráva'],
  [/<aside class="news-rail">[\s\S]*?<\/aside>/, churchCzRail, 'církevní důkazní síť'],
  [/<div class="node-grid">[\s\S]*?<\/div>/, churchCzNodes, 'církevní uzly']
], 'cs');

const churchEnLead = `<article class="lead-story"><div class="story-image"><img src="assets/konopna-cirkev-logo.jpg" alt="Church of Cannabis logo"><span>Church of Cannabis</span></div><div class="story-copy"><p class="kicker">PASTORAL LETTERS · NEW PROCEEDING CONFIRMED 12 AUGUST 2026</p><h1><a href="listiny/doc-cz-mk-2026-08-12-mk-49467-2026-socns.html" hreflang="cs">The new Church of Cannabis proceeding formally began on 26 June 2026.</a></h1><p class="standfirst">The Ministry of Culture is conducting the proceeding under file MK-S 6893/2026 and identified the authorised officials. The Office of the President separately declined to assist with flying the cannabis standard.</p><div class="score score-red"><strong>9/9</strong><span>KEY PROCEDURAL RECORD · ACTIVE PROCEEDING</span></div><div class="facts"><p><b>Ministry of Culture:</b> ref. MK 49467/2026 SOCNS, dated 12 August 2026.</p><p><b>Office of the President:</b> ref. 4873/2026, dated 12 August 2026; the original PDF is publicly linked.</p></div></div></article>`;
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
  [/(<a href="zpravy\/04082026-010\.html"[^>]*>A time for the state to love<\/a><\/h2><p>)[^<]+/, `$1Czech canonical report: a living chronology of ${stateCount} state and public-institution records through ${latestEn}, with linked responses and source PDFs.`, 'Godot v anglickém archivu']
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
    if (!html.includes(`href="${stylesheet}"`)) throw new Error(`${label}: chybí společný ${stylesheet}`);
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

console.log(`Veřejné varianty synchronizovány: ${czDisplayDate}; ${stateCount} státních listin; ${activePdfCount} aktivních PDF; 4/4 plochy obsahují stejné tři nejnovější evidenční záznamy.`);
