import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const articlePath = 'web/zpravy/04082026-010.html';
const homePath = 'web/index.html';
const dataDir = 'web/data';
const listinyDir = 'web/listiny';
const registrySource = 'project-memory/documents-2026.json';
const institutionsSource = 'project-memory/institutions.json';
const registryTarget = `${dataDir}/documents-2026.json`;
const institutionsTarget = `${dataDir}/institutions.json`;
const scriptTag = '<script src="document-chronology.js" defer></script>';
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
  ['case-cz-kpr-tri-vetve', 'KPR – tři aktuální větve']
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

const compareDocuments = (a, b) =>
  String(a.issue_date || '').localeCompare(String(b.issue_date || '')) ||
  String(a.received_date || '').localeCompare(String(b.received_date || '')) ||
  String(a.id || '').localeCompare(String(b.id || ''));

const normalizePublicPath = value => {
  if (!value) return null;
  if (/^(?:https?:|mailto:|#|\/)/i.test(value)) return value;
  return value.replace(/^\.\//, '');
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
const ids = new Set();
const documents = [...registry.documents].sort(compareDocuments);

for (const item of documents) {
  if (!item.id || !item.issue_date || !item.institution_id) throw new Error(`Neúplný dokument: ${JSON.stringify(item)}`);
  if (ids.has(item.id)) throw new Error(`Duplicitní stabilní ID dokumentu: ${item.id}`);
  ids.add(item.id);
}

const documentLink = item => {
  const published = item.public || {};
  if (published.pdf) return { href: normalizePublicPath(published.pdf), label: 'originál PDF', external: true };
  if (published.html) return { href: normalizePublicPath(published.html), label: 'stránka listiny', external: false };
  return { href: `listiny/${item.id}.html`, label: 'evidenční stránka', external: false };
};

const relationText = item => {
  if (!Array.isArray(item.relations) || !item.relations.length) return '';
  return `<span class="relations">${item.relations.map(rel => {
    const type = escapeHtml(rel.type || rel.relation_type || 'souvisí');
    const target = escapeHtml(rel.target_id || rel.document_id || '');
    return target ? `${type}: <a href="#${target}">${target}</a>` : type;
  }).join(' · ')}</span>`;
};

const renderChronologyItem = item => {
  const institution = institutionMap.get(item.institution_id);
  const name = institution?.name_cs || institution?.name || item.institution_id;
  const link = documentLink(item);
  const target = link.external ? ' target="_blank" rel="noopener"' : '';
  const cases = Array.isArray(item.case_ids) && item.case_ids.length
    ? `<span class="case-links">Řízení: ${item.case_ids.map(id => `<a href="#${escapeHtml(id)}">${escapeHtml(id)}</a>`).join(', ')}</span>`
    : '';
  return `<li id="${escapeHtml(item.id)}" data-issue-date="${escapeHtml(item.issue_date)}" data-institution-id="${escapeHtml(item.institution_id)}"><span class="institution">${escapeHtml(name)}</span>, ${escapeHtml(formatDate(item.issue_date))}${item.reference ? `, ${escapeHtml(item.reference)}` : ''}${item.user_title ? ` — ${escapeHtml(item.user_title)}` : ''} — <a href="${escapeHtml(link.href)}"${target}>${link.label}</a>${cases}${relationText(item)}</li>`;
};

const mainDocuments = documents.filter(item => item.issue_date >= MAIN_FROM);
const archiveDocuments = documents.filter(item => item.issue_date < MAIN_FROM);
const stateDocuments = mainDocuments.filter(item => item.document_type === 'state_record');

const caseIndex = `<section id="rizeni-online" class="case-anchor-index"><h3>Aktivní uzly řízení</h3>${caseAnchors.map(([id, label]) => `<article id="${id}" class="case-anchor-node"><h4>${escapeHtml(label)}</h4><p>Související listiny a procesní kroky jsou propojeny v chronologii níže.</p></article>`).join('')}</section>`;
const chronologyHtml = `<ol id="chronologie-seznam">${mainDocuments.map(renderChronologyItem).join('')}</ol>`;
const archiveHtml = archiveDocuments.length
  ? `<h2 id="archiv-vstupu-do-eu">Archiv vstupu do EU</h2><p>Dokumentovaná historie podání, rozhodnutí, obran a institucionálních vazeb před 1. květnem 2026, systematicky zejména od roku 2010.</p><ol id="archiv-seznam" start="${mainDocuments.length + 1}">${archiveDocuments.map(renderChronologyItem).join('')}</ol>`
  : '';

let article = await readFile(articlePath, 'utf8');
article = article
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Státu lásky čas: průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.">')
  .replace(/<p class="standfirst">[\s\S]*?<\/p>/, '<p class="standfirst">Průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.</p>')
  .replace(/<div class="news-meta">[\s\S]*?<\/div>/, `<div class="news-meta"><span>Od 1. května 2026</span><span>Stát: ${stateDocuments.length} evidovaných listin</span><span>Autor: Mgr. Dušan Dvořák</span></div>`)
  .replace(/<h2 id="chronologie">[\s\S]*?<\/h2>/, '<h2 id="chronologie">Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?</h2>')
  .replace(/<section id="rizeni-online"[\s\S]*?<\/section>\s*/g, '')
  .replace(/<ol(?: id="chronologie-seznam")?[^>]*>[\s\S]*?<\/ol>/, `${caseIndex}${chronologyHtml}${archiveHtml}`);

if (!article.includes(scriptTag)) article = article.replace('</body>', `  ${scriptTag}\n</body>`);
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
  const html = `<!doctype html><html lang="cs"><head><base href="https://dusandvorak-byte.github.io/ai-advocate-evidence-lab/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)} · ${escapeHtml(item.reference || item.id)}</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body><main class="article-shell"><article><header class="article-header"><p class="kicker">${escapeHtml(name)} · EVIDENČNÍ LISTINA</p><h1>${escapeHtml(item.reference || item.user_title || item.id)}</h1><p class="standfirst">${escapeHtml(item.user_title || 'Evidenční záznam dokumentu')}</p></header><div class="article-body"><p><b>Datum dokumentu:</b> ${escapeHtml(formatDate(item.issue_date))}</p><p><b>Instituce:</b> ${escapeHtml(name)}</p><p><b>Typ záznamu:</b> ${escapeHtml(item.document_type || 'neuvedeno')}</p><p><b>Stabilní ID:</b> <code>${escapeHtml(item.id)}</code></p>${cases}${directPdf}${relations}<p><a href="zpravy/04082026-010.html#${escapeHtml(item.id)}">Zpět do chronologie</a></p></div></article></main></body></html>`;
  await writeFile(`${listinyDir}/${item.id}.html`, html, 'utf8');
  generatedPages += 1;
}

if (!article.includes('id="chronologie-seznam"') || mainDocuments.length === 0) throw new Error('Statická chronologie nebyla vytvořena');
console.log(`Statický Pavouk vytvořen: ${mainDocuments.length} položek od 1. 5. 2026, z toho ${stateDocuments.length} státních listin; ${archiveDocuments.length} archivních položek; ${generatedPages} evidenčních stránek.`);
