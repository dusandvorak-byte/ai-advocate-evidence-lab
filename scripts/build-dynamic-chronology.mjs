import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const articlePath = 'web/zpravy/04082026-010.html';
const homePath = 'web/index.html';
const dataDir = 'web/data';
const listinyDir = 'web/listiny';
const registrySource = 'project-memory/documents-2026.json';
const institutionsSource = 'project-memory/institutions.json';
const registryTarget = `${dataDir}/documents-2026.json`;
const institutionsTarget = `${dataDir}/institutions.json`;
const scriptTag = '<script src="../document-chronology.js" defer></script>';
const oldScriptTag = '<script src="document-chronology.js" defer></script>';
const homeScriptTag = '<script src="live-dockets.js" defer></script>';
const homeStyleTag = '<link rel="stylesheet" href="live-dockets.css">';
const targetInstitutionTypes = new Set(['police', 'police_lab', 'prosecution', 'ministry', 'executive_office']);

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

await mkdir(dataDir, { recursive: true });
await mkdir(listinyDir, { recursive: true });
await copyFile(registrySource, registryTarget);
await copyFile(institutionsSource, institutionsTarget);

let article = await readFile(articlePath, 'utf8');
article = article
  .replace(oldScriptTag, scriptTag)
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Státu lásky čas: průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.">')
  .replace(/<p class="standfirst">[\s\S]*?<\/p>/, '<p class="standfirst">Průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.</p>')
  .replace(/<div class="news-meta"><span>[^<]*<\/span><span>[^<]*<\/span><span>Autor:/, '<div class="news-meta"><span>Od 1. května 2026</span><span>Průběžná evidence</span><span>Autor:')
  .replace(/<h2 id="chronologie">[\s\S]*?<\/h2>/, '<h2 id="chronologie">Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?</h2>')
  .replace(/<section class="source-box" id="aktivni">[\s\S]*?<\/section>/, '')
  .replace(/<a href="#aktivni">Aktivní originály<\/a>/, '')
  .replace(/\.source-box\{[^}]*\}/g, '')
  .replace(/\.source-box li\{[^}]*\}/g, '')
  .replace(/\.pending\{[^}]*\}/g, '');

if (!article.includes(scriptTag)) {
  if (!article.includes('</body>')) throw new Error(`${articlePath} nemá uzavírací značku </body>`);
  article = article.replace('</body>', `${scriptTag}</body>`);
}
await writeFile(articlePath, article, 'utf8');

let home = await readFile(homePath, 'utf8');
home = home
  .replace(/Chronologický seznam 55 dokumentů sbírky Godot on-line od 6\. května do 3\. srpna 2026\./g, 'Chronologický seznam dokumentů sbírky Godot on-line od 1. května 2026.')
  .replace(/Chronologický seznam sbírky Godot on-line od května 2026: 55 rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů do 3\. srpna 2026\./g, 'Průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.')
  .replace(/<span>6\. 5\.–3\. 8\. 2026<\/span><span>55 dokumentů<\/span>/g, '<span>Od 1. května 2026</span><span>Průběžná evidence</span>')
  .replace(/\s*<aside class="quick-memory" id="pamet">[\s\S]*?<\/aside>/, '')
  .replace(/\s*<a href="#pamet">Paměť případu<\/a>/, '')
  .replace(/<a href="#pamet">Otevřít paměť případu →<\/a>/, '<a href="zpravy/04082026-010.html#chronologie">Otevřít Pavouka řízení →</a>')
  .replace(/<a href="#pamet">Tři zveřejněné uzly ukazují, jak se jedna otázka dělí mezi více institucí<\/a>/, '<a href="zpravy/04082026-010.html#chronologie">Pavouk řízení ukazuje, jak se jedna otázka dělí mezi více institucí</a>');

if (!home.includes(homeStyleTag)) {
  if (!home.includes('</head>')) throw new Error(`${homePath} nemá uzavírací značku </head>`);
  home = home.replace('</head>', `  ${homeStyleTag}\n</head>`);
}
if (!home.includes(homeScriptTag)) {
  if (!home.includes('</body>')) throw new Error(`${homePath} nemá uzavírací značku </body>`);
  home = home.replace('</body>', `  ${homeScriptTag}\n</body>`);
}
await writeFile(homePath, home, 'utf8');

const registry = JSON.parse(await readFile(registryTarget, 'utf8'));
const institutions = JSON.parse(await readFile(institutionsTarget, 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('Rejstřík documents-2026.json neobsahuje pole documents');
if (!Array.isArray(institutions.institutions)) throw new Error('Rejstřík institutions.json neobsahuje pole institutions');

const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));
const ids = new Set();
let generatedPages = 0;
let unknownInstitutions = 0;

for (const documentItem of registry.documents) {
  if (!documentItem.id || !documentItem.issue_date || !documentItem.institution_id) {
    throw new Error(`Neúplný dokument v rejstříku: ${JSON.stringify(documentItem)}`);
  }
  if (ids.has(documentItem.id)) throw new Error(`Duplicitní stabilní ID dokumentu: ${documentItem.id}`);
  ids.add(documentItem.id);

  const institution = institutionMap.get(documentItem.institution_id);
  if (!institution) {
    unknownInstitutions += 1;
    console.warn(`Neznámá instituce ${documentItem.institution_id} u ${documentItem.id}; dokument zůstává v chronologii pod kódem instituce.`);
    continue;
  }
  if (!targetInstitutionTypes.has(institution.type)) continue;

  const publicData = documentItem.public || {};
  const directPdf = publicData.pdf
    ? `<p><a href="../${escapeHtml(publicData.pdf)}" target="_blank" rel="noopener">Otevřít originální listinu v PDF</a></p>`
    : '<p><b>Originální PDF:</b> dosud není fyzicky uloženo ve veřejném repozitáři. Tato stránka je stabilním veřejným evidenčním odkazem.</p>';
  const html = `<!doctype html><html lang="cs"><head><base href="https://dusandvorak-byte.github.io/ai-advocate-evidence-lab/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(institution.name)} · ${escapeHtml(documentItem.reference || documentItem.id)}</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body><main class="article-shell"><article><header class="article-header"><p class="kicker">${escapeHtml(institution.name)} · EVIDENČNÍ LISTINA</p><h1>${escapeHtml(documentItem.reference || documentItem.user_title || documentItem.id)}</h1><p class="standfirst">${escapeHtml(documentItem.user_title || 'Evidenční záznam dokumentu')}</p></header><div class="article-body"><p><b>Datum dokumentu:</b> ${escapeHtml(formatDate(documentItem.issue_date))}</p><p><b>Instituce:</b> ${escapeHtml(institution.name)}</p><p><b>Stabilní ID:</b> <code>${escapeHtml(documentItem.id)}</code></p>${directPdf}<p><a href="zpravy/04082026-010.html#${escapeHtml(documentItem.id)}">Zpět do chronologie</a></p></div></article></main></body></html>`;
  await writeFile(`${listinyDir}/${documentItem.id}.html`, html, 'utf8');
  generatedPages += 1;
}

console.log(`Pavouk řízení připraven z rejstříku: ${registry.documents.length} dokumentů; ${generatedPages} stabilních stránek; ${unknownInstitutions} nekatalogizovaných institucí nezablokovalo deploy.`);
