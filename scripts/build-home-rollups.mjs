import { readFile, writeFile } from 'node:fs/promises';

const homePath = 'web/index.html';
const registryPath = 'project-memory/documents-2026.json';
const institutionsPath = 'project-memory/institutions.json';
const godotHref = 'zpravy/04082026-010.html#chronologie';
const leadHref = 'zpravy/07082026-011.html';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');
const formatCzDate = value => {
  const [year, month, day] = String(value || '').split('-');
  return `${Number(day)}. ${Number(month)}. ${year}`;
};
const todayCz = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague', day: 'numeric', month: 'long', year: 'numeric'
}).format(new Date()).replace(/\.$/, '');

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const institutions = JSON.parse(await readFile(institutionsPath, 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('documents-2026.json neobsahuje pole documents');
if (!Array.isArray(institutions.institutions)) throw new Error('institutions.json neobsahuje pole institutions');
const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));
const stateRecords = registry.documents.filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record');
const stateCount = stateRecords.length;
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

const courtLinks = [
  ['Okresní soud v Prostějově, sp. zn. 2 T 104/2010 – obnova', '#case-cz-os-pro-2t104-2010-obnova'],
  ['Okresní soud v Prostějově – prevence 2026', '#case-cz-os-pro-prevence-2026'],
  ['Obvodní soud pro Prahu 4, sp. zn. 10 C 69/2026 – Česká televize', '#case-cz-os-praha4-10c69-2026'],
  ['Městský soud v Praze, sp. zn. 18 A 17/2026 – NCOZ', '#case-cz-ms-praha-18a17-2026'],
  ['Městský soud v Praze, sp. zn. 18 A 23/2026 – Ministerstvo spravedlnosti', '#case-cz-ms-praha-18a23-2026'],
  ['Městský soud v Praze, sp. zn. 8 Ad 9/2026 – Ministerstvo zdravotnictví', '#case-cz-ms-praha-8ad9-2026'],
  ['Městský soud v Praze, sp. zn. 45 T 1/2024 – vráceno Vrchním soudem v Praze', '#case-cz-ms-praha-45t1-2024']
];
const pretrialLinks = [
  ['OSZ Prostějov – prevence 2026', '#case-cz-osz-pro-prevence-2026'],
  ['Policie ČR – prevence Prostějov 2026', '#case-cz-pcr-prevence-prostejov-2026'],
  ['Policie ČR – interní přezkum KÚ', '#case-cz-pcr-ku-interni-prezkum'],
  ['NSZ – předžalobní výzva', '#case-cz-nsz-predzalobni-vyzva'],
  ['VSZ Praha – dohled MSZ', '#case-cz-vsz-praha-dohled-msz'],
  ['MSZ Praha – přezkumy', '#case-cz-msz-praha-prezkumy'],
  ['VSZ Olomouc – dohled KSZ Brno', '#case-cz-vsz-olomouc-dohled-ksz-brno'],
  ['KSZ Brno – přezkumy', '#case-cz-ksz-brno-prezkumy'],
  ['KPR – tři aktuální větve', '#case-cz-kpr-tri-vetve']
];
const stateLoveLinks = [
  ['Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?', '#chronologie'],
  ['Policie ČR – sdělení, rozhodnutí a opravné prostředky', '#instituce-policie'],
  ['Státní zastupitelství – sdělení, rozhodnutí a opravné prostředky', '#instituce-statni-zastupitelstvi'],
  ['Kancelář prezidenta republiky – tři větve řízení', '#instituce-kpr'],
  ['Ministerstva – vnitra, spravedlnosti, zdravotnictví a kultury', '#instituce-ministerstva']
];

const row = ({ title, prompt, action = 'Rozbalit →' }) => `<span class="rollup-title">${escapeHtml(title)}</span><span class="rollup-prompt">${escapeHtml(prompt)}</span><span class="rollup-heart" aria-hidden="true">❤️</span><span class="rollup-action">${escapeHtml(action)}</span>`;
const linkGrid = links => `<div class="rollup-links">${links.map(([label, hash]) => `<a href="zpravy/04082026-010.html${hash}">${escapeHtml(label)}</a>`).join('')}</div>`;
const detail = (id, title, prompt, body, heavy = false) => `<details data-home-rollup="${id}" class="home-rollup${heavy ? ' home-rollup-heavy' : ''}"><summary>${row({ title, prompt })}</summary>${body}</details>`;
const direct = (id, title, prompt, href, heavy = true) => `<a data-home-rollup="${id}" class="home-rollup home-rollup-link${heavy ? ' home-rollup-heavy' : ''}" href="${href}">${row({ title, prompt })}</a>`;

const latestCards = latestRecords.map(item => {
  const institution = institutionMap.get(item.institution_id) || {};
  const name = institution.name_cs || institution.name || item.institution_id;
  const detailHref = publicPath(item.public?.html || `listiny/${item.id}.html`);
  const pdf = item.public?.pdf ? publicPath(item.public.pdf) : null;
  const pdfLink = pdf
    ? `<a class="latest-record-pdf" href="${escapeHtml(pdf)}" target="_blank" rel="noopener">Originální PDF</a>`
    : '<span class="latest-record-pending">Evidenční stránka; PDF dosud není veřejné</span>';
  return `<article class="latest-record-card" data-document-id="${escapeHtml(item.id)}"><p class="kicker">${escapeHtml(formatCzDate(item.issue_date))} · ${escapeHtml(name)}</p><h3><a href="${escapeHtml(detailHref)}">${escapeHtml(item.user_title)}</a></h3><p class="latest-record-reference">${escapeHtml(item.reference || 'Bez samostatného č. j.')}</p>${pdfLink}</article>`;
}).join('');

const stack = `<section id="home-rollup-stack" class="home-rollup-stack" aria-label="Šest hlavních vstupů CannaInsider.EU">
${detail('court', 'Aktivní soudní řízení on-line od 1. května 2026', 'číst jako investigativu s láskou →', linkGrid(courtLinks))}
${detail('pretrial', 'Předžalobní řízení on-line od 1. května 2026', 'číst jako investigativu s láskou →', linkGrid(pretrialLinks))}
${detail('state-love', 'Státní láska online od 1. května 2026', 'číst jako investigativu s láskou →', linkGrid(stateLoveLinks))}
${detail('latest', `Státu lásky čas do ${todayCz} →`, 'poslední tři polibky státu →', `<div class="latest-record-grid">${latestCards}</div>`, true)}
${direct('godot', `Státu lásky čas od 1. května 2026 do ${todayCz} znamená celkem ${stateCount} vášnivých polibků státních orgánů při čekání na Godota →`, '', godotHref)}
${direct('lead', 'ZPRÁVA DNE · CANNAINSIDER.EU NEWS · 7. 8. 2026 · EVROPSKÁ VĚTEV · REPORT 07082026-011 →', '', leadHref)}
<a hidden class="rollup-build-compatibility" href="${godotHref}">Godot online →</a>
</section>`;

function removeBalancedElementById(html, id) {
  const markerPos = html.indexOf(`id="${id}"`);
  if (markerPos < 0) return html;
  const starts = ['<section', '<details', '<div', '<article'];
  let start = -1, tag = null;
  for (const token of starts) {
    const pos = html.lastIndexOf(token, markerPos);
    if (pos > start) { start = pos; tag = token.slice(1); }
  }
  if (start < 0 || !tag) throw new Error(`Nelze najít začátek elementu ${id}`);
  const re = new RegExp(`<${tag}\\b|<\\/${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0, match;
  while ((match = re.exec(html))) {
    if (match[0].startsWith(`</`)) depth -= 1; else depth += 1;
    if (depth === 0) return html.slice(0, start) + html.slice(re.lastIndex);
  }
  throw new Error(`Element ${id} není uzavřen`);
}

let html = await readFile(homePath, 'utf8');
html = removeBalancedElementById(html, 'home-rollup-stack');
html = removeBalancedElementById(html, 'live-dockets');
html = removeBalancedElementById(html, 'latest-records');
html = html
  .replace(/<div class="edition-bar">[\s\S]*?<\/div>/g, '')
  .replace(/<section class="newsroom-alert" id="prave-ted">[\s\S]*?<\/section>/g, '')
  .replace(/<section class="news-lead">[\s\S]*?<\/section>/g, '');
if (!html.includes('<nav class="nav">')) throw new Error('Titulní stránka neobsahuje hlavní navigaci');
html = html.replace(/(<nav class="nav">[\s\S]*?<\/nav>)/, `$1\n${stack}`);
if (!html.includes('href="home-rollups.css"')) html = html.replace('</head>', '<link rel="stylesheet" href="home-rollups.css"></head>');

const rollupCount = (html.match(/data-home-rollup=/g) || []).length;
if (rollupCount !== 6) throw new Error(`Titulní strana nemá přesně šest lišt: ${rollupCount}`);
if ((html.match(/id="home-rollup-stack"/g) || []).length !== 1) throw new Error('Titulní strana nemá právě jeden kanonický zásobník lišt');
if (html.includes('class="edition-bar"') || /Aktualizováno\s+\d/i.test(html)) throw new Error('Na titulní straně zůstala odstraněná lišta aktualizace');
if (!html.includes(`data-home-rollup="godot"`) || !html.includes(`href="${godotHref}"`)) throw new Error('Lišta Státu lásky čas nevede přímo na chronologii');
if (!html.includes(`data-home-rollup="lead"`) || !html.includes(`href="${leadHref}"`)) throw new Error('Lišta CannaInsider.EU nevede přímo na report 07082026-011');

await writeFile(homePath, html, 'utf8');
console.log(`Titulní strana materializována jako přesně šest souměrných lišt; stavové listiny: ${stateCount}; datum: ${todayCz}.`);
