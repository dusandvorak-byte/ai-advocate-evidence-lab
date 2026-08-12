import { readFile, writeFile } from 'node:fs/promises';

const sources = JSON.parse(await readFile('project-memory/document-sources.json', 'utf8'));
if (!Array.isArray(sources.sources) || !sources.sources.length) {
  throw new Error('document-sources.json neobsahuje kanonické zdroje dokumentů');
}
const sourceDocuments = [];
for (const source of sources.sources) {
  const registry = JSON.parse(await readFile(source.path, 'utf8'));
  if (!Array.isArray(registry.documents)) throw new Error(`${source.path} neobsahuje pole documents`);
  sourceDocuments.push(...registry.documents);
}
const documents = [...new Map(sourceDocuments.map(item => [item.id, item])).values()];

const stateRecords = documents.filter(item =>
  item.issue_date >= '2026-05-01' && item.document_type === 'state_record'
);
const stateCount = stateRecords.length;
const latestIssueDate = stateRecords.map(item => item.issue_date).sort().at(-1);
if (!latestIssueDate) throw new Error('Registr neobsahuje žádnou státní listinu od 1. května 2026');

const canonicalHome = await readFile('web/index.html', 'utf8');
const canonicalDate = canonicalHome.match(/data-current-date>(\d{1,2})\. SRPNA (\d{4})</i);
if (!canonicalDate) throw new Error('Česká titulní stránka neobsahuje kanonické datum aktualizace');
const [, day, year] = canonicalDate;
const czDisplayDate = `${day}. SRPNA ${year}`;
const enDisplayDate = `${day} AUGUST ${year}`;
const enLongDate = `${day} August ${year}`;
const latest = new Date(`${latestIssueDate}T00:00:00Z`);
const latestCz = `${latest.getUTCDate()}. srpna ${latest.getUTCFullYear()}`;
const latestEn = `${latest.getUTCDate()} August ${latest.getUTCFullYear()}`;

const update = async (path, transforms) => {
  let html = await readFile(path, 'utf8');
  for (const [pattern, replacement, label] of transforms) {
    if (!pattern.test(html)) throw new Error(`${path}: nenalezen synchronizační bod ${label}`);
    html = html.replace(pattern, replacement);
  }
  await writeFile(path, html, 'utf8');
};

await update('web/en.html', [
  [/data-current-date>[^<]+</, `data-current-date>${enDisplayDate}<`, 'datum'],
  [/Updated [^<]+</, `Updated ${enLongDate} · ${stateCount} state and public-institution records in the canonical chronology<`, 'souhrn chronologie']
]);

await update('web/kc/index.html', [
  [/(<header class="topline"><span>)[^<]+/, `$1${czDisplayDate}`, 'datum'],
  [/(<section class="newsroom-alert" id="zive"><b>ŽIVÁ PAMĚŤ CÍRKVE<\/b><span>)[^<]+/, `$1Konopná církev používá sdílenou ověřovanou důkazní paměť; kanonická chronologie nyní obsahuje ${stateCount} státních listin a církev si zachovává vlastní pastýřskou identitu.`, 'souhrn chronologie']
]);

await update('web/kc/en.html', [
  [/(<header class="topline"><span>)[^<]+/, `$1${enDisplayDate}`, 'datum'],
  [/(<section class="newsroom-alert" id="live"><b>LIVE CHURCH RECORD<\/b><span>)[^<]+/, `$1The Church of Cannabis uses the shared verified evidence memory; the canonical chronology now contains ${stateCount} state records, while the Church retains its own pastoral identity.`, 'souhrn chronologie']
]);

await update('web/news/index.html', [[
  /(<a href="zpravy\/04082026-010\.html"[^>]*>A time for the state to love<\/a><\/h2><p>)[^<]+/,
  `$1Czech canonical report: a living chronology of ${stateCount} state and public-institution records through ${latestEn}, with linked responses and source PDFs.`,
  'Godot v anglickém archivu'
]]);

await update('web/zpravy/index.html', [[
  /(<a href="zpravy\/04082026-010\.html">Státu lásky čas<\/a><\/h2><p>)[^<]+/,
  `$1Živá chronologie ${stateCount} listin státu a veřejných institucí od 1. května do ${latestCz}, s propojenými reakcemi a zdrojovými PDF.`,
  'Godot v českém archivu'
]]);

// Čtyři povinně synchronizované veřejné plochy. Všechny musí používat tentýž
// společný newsroom layout; církev si ponechává pouze barevnou/brandovou masku.
const surfaces = [
  ['CannaInsider CZ', 'web/index.html'],
  ['CannaInsider international', 'web/en.html'],
  ['Konopná církev CZ', 'web/kc/index.html'],
  ['Church of Cannabis international', 'web/kc/en.html']
];
for (const [label, path] of surfaces) {
  const html = await readFile(path, 'utf8');
  for (const stylesheet of ['styles.css', 'brand.css']) {
    if (!html.includes(`href="${stylesheet}"`)) {
      throw new Error(`${label}: chybí společný ${stylesheet}; synchronizace layoutu nesmí pokračovat`);
    }
  }
  if (!html.includes('class="topline"') || !html.includes('class="masthead"') || !html.includes('class="nav"')) {
    throw new Error(`${label}: chybí některá společná rámová komponenta topline/masthead/nav`);
  }
}

console.log(`Veřejné varianty synchronizovány: ${czDisplayDate}; ${stateCount} státních listin; poslední listina ${latestIssueDate}; 4/4 povinných ploch sdílí styles.css + brand.css.`);
