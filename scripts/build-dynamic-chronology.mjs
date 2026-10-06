import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const articlePath = 'web/zpravy/04082026-010.html';
const homePath = 'web/index.html';
const dataDir = 'web/data';
const listinyDir = 'web/listiny';
const registrySource = 'project-memory/documents-2026.json';
const institutionsSource = 'project-memory/institutions.json';
const registryTarget = `${dataDir}/documents-2026.json`;
const institutionsTarget = `${dataDir}/institutions.json`;
const homeScriptTag = '<script src="live-dockets.js" defer></script>';
const homeStyleTag = '<link rel="stylesheet" href="live-dockets.css">';
const MAIN_FROM = '2026-05-01';

const caseAnchors = [
  ['case-cz-os-pro-2t104-2010-obnova', 'OS Prostějov sp. zn. 2 T 104/2010 – obnova'],
  ['case-cz-os-pro-prevence-2026', 'OS Prostějov – prevence 2026'],
  ['case-cz-os-praha4-10c69-2026', 'OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize'],
  ['case-cz-ms-praha-18a17-2026', 'MS v Praze sp. zn. 18 A 17/2026 – NCOZ'],
  ['case-cz-ms-praha-18a23-2026', 'MS v Praze sp. zn. 18 A 23/2026 – MSp'],
  ['case-cz-ms-praha-8ad9-2026', 'MS v Praze sp. zn. 8 Ad 9/2026 – MZ'],
  ['case-cz-ms-praha-45t1-2024', 'MS v Praze sp. zn. 45 T 1/2024 – vratka VS'],
  ['case-cz-osz-pro-prevence-2026', 'OSZ Prostějov – prevence 2026'],
  ['case-cz-pcr-prevence-prostejov-2026', 'Policie ČR – prevence Prostějov 2026'],
  ['case-cz-pcr-ku-interni-prezkum', 'Policie ČR – interní přezkum Kriminalistického ústavu'],
  ['case-cz-nsz-predzalobni-vyzva', 'NSZ – předžalobní výzva'],
  ['case-cz-vsz-praha-dohled-msz', 'VSZ Praha – dohled MSZ'],
  ['case-cz-msz-praha-prezkumy', 'MSZ Praha – přezkumy'],
  ['case-cz-vsz-olomouc-dohled-ksz-brno', 'VSZ Olomouc – dohled KSZ Brno'],
  ['case-cz-ksz-brno-prezkumy', 'KSZ Brno – přezkumy'],
  ['case-cz-kpr-tri-vetve', 'KPR – tři aktuální větve'],
  ['instituce-policie', 'Policie České republiky'],
  ['instituce-statni-zastupitelstvi', 'Státní zastupitelství'],
  ['instituce-kpr', 'Kancelář prezidenta republiky'],
  ['instituce-ministerstva', 'Ministerstva']
];

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatDate = value => {
  if (!value) return 'datum neuvedeno';
  const [year, month, day] = value.split('-');
  return `${Number(day)}. ${Number(month)}. ${year}`;
};

const referenceText = item => String(item.reference || '').trim() || 'bez samostatného č. j./sp. zn.';

const compareDocuments = (a, b) =>
  String(b.issue_date || '').localeCompare(String(a.issue_date || '')) ||
  String(b.received_date || '').localeCompare(String(a.received_date || '')) ||
  String(b.id || '').localeCompare(String(a.id || ''));

const tailPriority = new Map([
  ['doc-eu-euda-2026-08-07-ack-article-265-tfeu', 0],
  ['doc-cz-kpr-2026-08-07-kpr-5772-2026-2', 1],
  ['doc-cz-os-pro-2026-08-07-15-nt-3105-2026-54', 2],
  ['doc-cz-ms-pha-2026-08-10-18-a-23-2026-130', 3],
  ['doc-cz-ms-pha-2026-08-10-18-a-23-2026-131', 4]
]);

const compareStateDocuments = (a, b) => {
  const date = String(b.issue_date || '').localeCompare(String(a.issue_date || ''));
  if (date) return date;
  const pa = tailPriority.has(a.id) ? tailPriority.get(a.id) : 999;
  const pb = tailPriority.has(b.id) ? tailPriority.get(b.id) : 999;
  if (pa !== pb) return pa - pb;
  return compareDocuments(a, b);
};

const normalizePublicPath = value => {
  if (!value) return null;
  if (/^(?:https?:|mailto:|#|\/)/i.test(value)) return value;
  return value.replace(/^\.\//, '').replace(/^web\//, '');
};

await mkdir(dataDir, { recursive: true });
await mkdir(listinyDir, { recursive: true });
await copyFile(registrySource, registryTarget);
await copyFile(institutionsSource, institutionsTarget);

const registry = JSON.parse(await readFile(registryTarget, 'utf8'));
const institutions = JSON.parse(await readFile(institutionsTarget, 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('Rejstřík documents-2026.json neobsahuje pole documents');
if (!Array.isArray(institutions.institutions)) throw new Error('Rejstřík institutions.json neobsahuje pole institutions');

const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));
const caseRegistry = JSON.parse(await readFile('project-memory/cases.json', 'utf8'));
const caseMap = new Map(caseRegistry.cases.map(item => [item.id, item]));
for (const id of new Set(registry.documents.flatMap(item => item.case_ids || []))) {
  if (!caseAnchors.some(([anchor]) => anchor === id) && caseMap.has(id)) caseAnchors.push([id, caseMap.get(id).title]);
}
const ids = new Set();
const documents = [...registry.documents].sort(compareDocuments);

for (const item of documents) {
  if (!item.id || !item.issue_date || !item.institution_id) throw new Error(`Neúplný dokument: ${JSON.stringify(item)}`);
  if (!String(item.user_title || '').trim()) throw new Error(`Dokument ${item.id} nemá popis toho, co se stalo (user_title). Povinný formát: kdo · datum · č. j./sp. zn. · co se stalo.`);
  if (!institutionMap.has(item.institution_id)) throw new Error(`Dokument ${item.id} odkazuje na neznámou instituci ${item.institution_id}`);
  if (ids.has(item.id)) throw new Error(`Duplicitní stabilní ID dokumentu: ${item.id}`);
  ids.add(item.id);
}

const documentLink = (item, fallbackLabel = 'Dokument v PDF') => {
  const published = item.public || {};
  if (published.pdf) {
    return { href: normalizePublicPath(published.pdf), label: 'Dokument v PDF', external: true };
  }
  if (published.html) return { href: normalizePublicPath(published.html), label: 'Evidenční stránka', external: false };
  return { href: `listiny/${item.id}.html`, label: 'Evidenční stránka', external: false };
};

const documentsById = new Map(documents.map(item => [item.id, item]));
const mainDocuments = documents.filter(item => item.issue_date >= MAIN_FROM);
const stateDocuments = mainDocuments
  .filter(item => item.document_type !== 'state_record_attachment' && (item.submission_side === 'incoming_from_state_or_public_institution' || item.document_type === 'state_record'))
  .sort(compareStateDocuments);
const outgoingDocuments = mainDocuments
  .filter(item => item.submission_side === 'outgoing_from_user_or_alliance')
  .sort(compareDocuments);

const isOutgoing = item => item?.submission_side === 'outgoing_from_user_or_alliance';
const uniqueById = items => [...new Map(items.filter(Boolean).map(item => [item.id, item])).values()].sort(compareDocuments);

const filingsForState = state => {
  const direct = (state.relations || [])
    .filter(rel => (rel.type || rel.relation_type) === 'reakce_na')
    .map(rel => documentsById.get(rel.target_id || rel.document_id || rel.target))
    .filter(isOutgoing);
  const reverse = outgoingDocuments.filter(item => (item.relations || []).some(rel =>
    (rel.type || rel.relation_type) === 'podani_na_ktere_organ_reaguje'
    && (rel.target_id || rel.document_id || rel.target) === state.id
  ));
  return uniqueById([...direct, ...reverse]);
};

const remediesForState = state => uniqueById(outgoingDocuments.filter(item => (item.relations || []).some(rel =>
  (rel.type || rel.relation_type) === 'reakce_na'
  && (rel.target_id || rel.document_id || rel.target) === state.id
)));

const renderRelated = items => {
  if (!items.length) return '<span class="state-love-empty">—</span>';
  return items.map(item => {
    const link = documentLink(item);
    const target = link.external ? ' target="_blank" rel="noopener"' : '';
    return `<span class="state-love-related" data-related-document-id="${escapeHtml(item.id)}"><b>${escapeHtml(formatDate(item.issue_date))}</b> · ${escapeHtml(item.user_title)} · <a href="${escapeHtml(link.href)}"${target}>${escapeHtml(link.label)}</a></span>`;
  }).join('<br>');
};

// Státu lásky čas contains only incoming state/public/international responses.
// Newest response stays visually on top; numbering runs chronologically from the oldest = 1.
const chronologyDocuments = stateDocuments;
const chronologyNumber = index => chronologyDocuments.length - index;

const renderChronologyRow = (item, index) => {
  const institution = institutionMap.get(item.institution_id);
  const subjectName = institution?.name_cs || institution?.name || item.institution_id;
  const link = documentLink(item);
  const target = link.external ? ' target="_blank" rel="noopener"' : '';
  const number = chronologyNumber(index);
  const sourceFilings = filingsForState(item);
  const remedies = remediesForState(item);
  return `<tr id="${escapeHtml(item.id)}" data-state-love-id="${escapeHtml(item.id)}" data-row-number="${number}" data-issue-date="${escapeHtml(item.issue_date)}" data-submission-side="incoming_from_state_or_public_institution"><td class="slalom-number">${number}</td><td><time datetime="${escapeHtml(item.issue_date)}">${escapeHtml(formatDate(item.issue_date))}</time></td><td>${escapeHtml(subjectName)}</td><td>${escapeHtml(referenceText(item))}</td><td>${escapeHtml(item.user_title)} · <a href="${escapeHtml(link.href)}"${target}>${escapeHtml(link.label)}</a></td><td class="state-love-relation-cell">${renderRelated(sourceFilings)}</td><td class="state-love-relation-cell">${renderRelated(remedies)}</td></tr>`;
};

const chronologyHtml = `<section class="justice-slalom-shell state-love-shell" aria-label="Státu lásky čas"><details class="home-rollup justice-slalom state-love-panel" open><summary><span class="rollup-title">Státu lásky čas</span><span class="rollup-prompt">reakce státu, veřejných a mezinárodních orgánů</span><span class="rollup-heart" aria-hidden="true">❤️</span><b class="rollup-action">Rozbalit ↓</b></summary><div class="justice-slalom-body"><p class="justice-slalom-intro">${chronologyDocuments.length} reakcí orgánů · nejnovější nahoře · nejstarší reakce má číslo 1.</p><div class="justice-slalom-scroll state-love-scroll"><table id="chronologie-seznam" class="state-love-table"><thead><tr><th scope="col">Č.</th><th scope="col">Datum</th><th scope="col">Orgán</th><th scope="col">č. j./sp. zn.</th><th scope="col">Co se stalo</th><th scope="col">Na co orgán reaguje</th><th scope="col">Námitka / opravný prostředek</th></tr></thead><tbody>${chronologyDocuments.map(renderChronologyRow).join('')}</tbody></table></div></div></details></section>`;

let article = await readFile(articlePath, 'utf8');
article = article
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Státu lásky čas: průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.">')
  .replace(/<p class="standfirst">[\s\S]*?<\/p>/, '<p class="standfirst">Průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.</p>')
  .replace(/<div class="news-meta">[\s\S]*?<\/div>/, `<div class="news-meta"><span>Od 1. května 2026</span><span>Stát: ${stateDocuments.length} evidovaných listin</span><span>Autor: Mgr. Dušan Dvořák</span></div>`)
  .replace(/<h2 id="chronologie">[\s\S]*?<\/h2>/, '<h2 id="chronologie">Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?</h2>')
  .replace(/<section id="(?:rizeni-online|chronology-case-index)"[\s\S]*?<\/section>\s*/g, '')
  .replace(/<h2 id="archiv-vstupu-do-eu">[\s\S]*?<ol id="archiv-seznam"[^>]*>[\s\S]*?<\/ol>/g, '')
  .replace(/<section class="justice-slalom-shell state-love-shell"[\s\S]*?<\/section>/, '__STATE_LOVE_TABLE__')
  .replace(/<div class="justice-slalom-scroll state-love-scroll">[\s\S]*?<\/table><\/div>/, '__STATE_LOVE_TABLE__')
  .replace(/<ol(?: id="chronologie-seznam")?[^>]*>[\s\S]*?<\/ol>/, '__STATE_LOVE_TABLE__')
  .replace('__STATE_LOVE_TABLE__', chronologyHtml)
  .replace(/<section id="lhuty-a-necinnost"[\s\S]*?<\/section>\s*/g, '')
  .replace(/<p><b>Anonymizační axiom:<\/b>[\s\S]*?<\/p>\s*/g, '')
  .replace(/<p><b>Důkazní hranice:<\/b>[\s\S]*?<\/p>\s*/g, '');

// The canonical build owns chronology, relations, case anchors and PDF labels.
// Retire both versioned and unversioned legacy renderers: they used to overwrite
// the finalized HTML after load with an older, incomplete relation model.
article = article.replace(/\s*<script\b[^>]*\bsrc=["'][^"']*\bdocument-chronology\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi, '');
await writeFile(articlePath, article, 'utf8');

let home = await readFile(homePath, 'utf8');
home = home
  .replace(/Chronologický seznam \d+ dokumentů sbírky Godot on-line od [^<.]+\./g, 'Chronologický seznam dokumentů sbírky Godot on-line od 1. května 2026.')
  .replace(/Chronologický seznam dokumentů sbírky Godot on-line od 6\. května do 3\. srpna 2026\./g, 'Chronologický seznam dokumentů sbírky Godot on-line od 1. května 2026.')
  .replace(/\s*<aside class="quick-memory" id="pamet">[\s\S]*?<\/aside>/, '')
  .replace(/\s*<a href="#pamet">Paměť případu<\/a>/, '');
if (!home.includes(homeStyleTag)) home = home.replace('</head>', `  ${homeStyleTag}\n</head>`);
if (!home.includes(homeScriptTag)) home = home.replace('</body>', `  ${homeScriptTag}\n</body>`);
await writeFile(homePath, home, 'utf8');

let generatedPages = 0;
for (const item of documents) {
  const institution = institutionMap.get(item.institution_id);
  const name = institution?.name_cs || institution?.name || item.institution_id;
  const published = item.public || {};
  const directPdf = published.pdf
    ? `<p><a href="${escapeHtml(normalizePublicPath(published.pdf))}" target="_blank" rel="noopener">Otevřít originální listinu v PDF</a></p>`
    : '<p><b>Originální PDF:</b> dosud není fyzicky uloženo ve veřejném repozitáři. Tato stránka je stabilním veřejným evidenčním odkazem.</p>';
  const cases = Array.isArray(item.case_ids) && item.case_ids.length ? `<p><b>Řízení:</b> ${item.case_ids.map(escapeHtml).join(', ')}</p>` : '';
  const relations = Array.isArray(item.relations) && item.relations.length ? `<h2>Procesní vazby</h2><ul>${item.relations.map(rel => `<li>${escapeHtml(rel.type || rel.relation_type || 'souvisí')} ${escapeHtml(rel.target_id || rel.document_id || '')}</li>`).join('')}</ul>` : '';
  const html = `<!doctype html><html lang="cs"><head><base href="https://dusandvorak-byte.github.io/ai-advocate-evidence-lab/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)} · ${escapeHtml(referenceText(item))}</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body><main class="article-shell"><article><header class="article-header"><p class="kicker">${escapeHtml(name)} · EVIDENČNÍ LISTINA</p><h1>${escapeHtml(referenceText(item))}</h1><p class="standfirst">${escapeHtml(item.user_title)}</p></header><div class="article-body"><p><b>Kdo:</b> ${escapeHtml(name)}</p><p><b>Datum:</b> ${escapeHtml(formatDate(item.issue_date))}</p><p><b>Č. j. / sp. zn.:</b> ${escapeHtml(referenceText(item))}</p><p><b>Co se stalo:</b> ${escapeHtml(item.user_title)}</p><p><b>Typ záznamu:</b> ${escapeHtml(item.document_type || 'neuvedeno')}</p><p><b>Stabilní ID:</b> <code>${escapeHtml(item.id)}</code></p>${cases}${directPdf}${relations}<p><a href="zpravy/04082026-010.html#${escapeHtml(item.id)}">Zpět do chronologie</a></p></div></article></main></body></html>`;
  await writeFile(`${listinyDir}/${item.id}.html`, html, 'utf8');
  generatedPages += 1;
}

if (!article.includes('id="chronologie-seznam"') || chronologyDocuments.length === 0) throw new Error('Tabulka Státu lásky čas nebyla vytvořena');
if (article.includes('chronology-case-index') || article.includes('lhuty-a-necinnost') || article.includes('Anonymizační axiom:') || article.includes('Důkazní hranice:')) throw new Error('Za tabulkou Státu lásky čas zůstal odstraněný pomocný blok');
console.log(`Státu lásky čas: ${chronologyDocuments.length} reakcí orgánů; vlastní podání pouze ve vztahových sloupcích; nejnovější nahoře, nejstarší=1; ${generatedPages} evidenčních stránek.`);
