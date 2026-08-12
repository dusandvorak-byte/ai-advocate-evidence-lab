import { mkdir, readFile, writeFile } from 'node:fs/promises';

const sourcePath = 'project-memory/process-timers.json';
const overridesPath = 'project-memory/process-timer-overrides.json';
const currentOverridesPath = 'project-memory/process-timer-overrides-2026-08-12.json';
const eudaResponsePath = 'project-memory/euda-response-2026-08-07.json';
const targetPath = 'web/data/process-timers.json';
const homePath = 'web/index.html';
const godotPath = 'web/zpravy/04082026-010.html';
const eudaArticlePath = 'web/zpravy/07082026-011.html';
const cssTag = '<link rel="stylesheet" href="process-timers.css">';
const scriptTag = '<script src="process-timers.js" defer></script>';
const timerBegin = '<!-- PROCESS-TIMERS:BEGIN -->';
const timerEnd = '<!-- PROCESS-TIMERS:END -->';

const REQUIRED_CURRENT_TIMER_IDS = [
  'timer-admin-kpr-repeat-16a-2026-08-10',
  'timer-admin-msz-stiznost-necinnost-2026-07-31',
  'timer-admin-msz-odvolani-sin48-2026',
  'timer-admin-nsz-odvolani-sin55-2026',
  'timer-admin-mv-rozklad-127234-2026'
];

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const removeBalancedElement = (html, startIndex, tagName) => {
  const re = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  re.lastIndex = startIndex;
  let depth = 0;
  let match;
  while ((match = re.exec(html))) {
    const closing = match[0].startsWith('</');
    depth += closing ? -1 : 1;
    if (depth === 0) return html.slice(0, startIndex) + html.slice(re.lastIndex);
  }
  throw new Error(`Nelze najít párový konec <${tagName}> od pozice ${startIndex}`);
};

const removeGeneratedTimerBlock = (html, tagName) => {
  const markedStart = html.indexOf(timerBegin);
  if (markedStart >= 0) {
    const markedEnd = html.indexOf(timerEnd, markedStart);
    if (markedEnd < 0) throw new Error('Blok časovačů má počáteční marker bez koncového markeru');
    return html.slice(0, markedStart) + html.slice(markedEnd + timerEnd.length);
  }
  const legacyStart = html.indexOf(`<${tagName} id="procesni-casovace"`);
  return legacyStart >= 0 ? removeBalancedElement(html, legacyStart, tagName) : html;
};

const registry = JSON.parse(await readFile(sourcePath, 'utf8'));
const overrides = JSON.parse(await readFile(overridesPath, 'utf8'));
const currentOverrides = JSON.parse(await readFile(currentOverridesPath, 'utf8'));
const eudaResponse = JSON.parse(await readFile(eudaResponsePath, 'utf8'));
if (!Array.isArray(registry.timers) || !Array.isArray(registry.historical_notice_points)) throw new Error('process-timers.json nemá očekávanou strukturu');
if (!Array.isArray(overrides.patches)) throw new Error('process-timer-overrides.json nemá pole patches');
if (!Array.isArray(currentOverrides.patches)) throw new Error('process-timer-overrides-2026-08-12.json nemá pole patches');

const timerMap = new Map(registry.timers.map(item => [item.id, { ...item }]));
for (const patch of [...overrides.patches, ...currentOverrides.patches]) {
  if (!patch.id) throw new Error(`Oprava časovače bez ID: ${JSON.stringify(patch)}`);
  timerMap.set(patch.id, { ...(timerMap.get(patch.id) || {}), ...patch });
}
registry.timers = [...timerMap.values()];
registry.overrides = {
  sources: [overridesPath, currentOverridesPath],
  applied: overrides.patches.length + currentOverrides.patches.length,
  updated_on: currentOverrides.updated_on || overrides.updated_on || null
};

const ids = new Set();
for (const item of registry.timers) {
  for (const key of ['id','category','title','start_date','reference','start_date_basis','limit_label','legal_basis']) {
    if (!item[key]) throw new Error(`Procesní časovač ${item.id || '(bez ID)'} nemá povinné pole ${key}.`);
  }
  if (ids.has(item.id)) throw new Error(`Duplicitní ID časovače: ${item.id}`);
  ids.add(item.id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.start_date)) throw new Error(`Neplatné datum časovače ${item.id}`);
  if (item.count_from_date && !/^\d{4}-\d{2}-\d{2}$/.test(item.count_from_date)) throw new Error(`Neplatný první den běhu ${item.id}`);
}
for (const requiredId of REQUIRED_CURRENT_TIMER_IDS) {
  if (!ids.has(requiredId)) throw new Error(`Chybí povinný aktuální časovač ${requiredId}`);
}

const labels = {
  court: 'Justice – soudní řízení',
  pre_action: 'Předžalobní a předprocesní výzvy',
  administrative: 'Správní a informační řízení',
  review_supervision: 'Přezkumy a dohledy',
  criminal_historical: 'Historická trestní důkazní větev'
};
const order = ['court', 'pre_action', 'administrative', 'review_supervision', 'criminal_historical'];

const row = item => {
  const end = item.end_date || '';
  const countStart = item.count_from_date || item.start_date;
  const title = item.href ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
  const due = item.due_date ? ` · konkrétní evidovaný konec: ${escapeHtml(item.due_date)}` : '';
  const history = item.process_history ? `<p class="timer-basis"><b>Průběh:</b> ${escapeHtml(item.process_history)}</p>` : '';
  const nextEvent = item.next_event ? `<p class="timer-basis"><b>Další úkon:</b> ${escapeHtml(item.next_event)}</p>` : '';
  const countNote = item.count_from_date ? `<p class="timer-basis"><b>Den 1 běhu:</b> ${escapeHtml(item.count_from_date)}</p>` : '';
  return `<article class="process-timer" data-process-timer data-start-date="${escapeHtml(countStart)}" data-event-date="${escapeHtml(item.start_date)}" data-timer-id="${escapeHtml(item.id)}"${end ? ` data-end-date="${escapeHtml(end)}"` : ''}>
    <div class="timer-value"><span data-elapsed-days>…</span> / <span>${escapeHtml(item.limit_label)}</span></div>
    <div class="timer-detail"><h4>${title}</h4><p class="timer-basis"><b>Kdo:</b> ${escapeHtml(item.title)}</p><p class="timer-basis"><b>Datum doručení/podání:</b> ${escapeHtml(item.start_date)}</p>${countNote}<p class="timer-basis"><b>Č. j. / sp. zn.:</b> ${escapeHtml(item.reference)}</p><p class="timer-basis"><b>Co se stalo:</b> ${escapeHtml(item.start_date_basis)}</p><p class="timer-basis"><b>Lhůta / procesní režim:</b> ${escapeHtml(item.legal_basis)}${due}</p>${history}${nextEvent}</div>
  </article>`;
};

const categories = order.map(category => {
  const items = registry.timers.filter(item => item.category === category);
  if (!items.length) return '';
  return `<section class="timer-category" data-timer-category="${category}"><h3>${escapeHtml(labels[category] || category)} <span class="timer-category-count">(${items.length})</span></h3><div class="timer-grid">${items.map(row).join('')}</div></section>`;
}).join('');

const notices = registry.historical_notice_points.map(item => `<article class="historical-notice"><h4>${escapeHtml(item.date)} · ${escapeHtml(item.title)}</h4><p>${escapeHtml(item.evidence)}</p><p><b>Význam pro projekt:</b> ${escapeHtml(item.boundary)}</p></article>`).join('');
const timerBody = `<p class="timer-legend"><b>Povinný formát:</b> kdo · datum · č. j./sp. zn. · co se stalo. <b>Počítání:</b> je-li doloženo doručení podání v uvedený den, tento den je den 0 a následující den je den 1. Pokud pevná číselná lhůta není, web ji nevymýšlí.</p>${categories}<h3>Historický společný referenční bod vědomosti státu</h3>${notices}`;
const godotSection = `${timerBegin}<section id="procesni-casovace" class="process-timers"><header><div><p class="section-label">DŮSLEDKY · ŽIVÉ PROCESNÍ ČASOVAČE</p><h2>Živé procesní časovače</h2></div></header><p class="timer-legend">Tento blok následuje až po chronologii listin veřejných institucí od 1. května 2026. Jde o odvozené procesní důsledky chronologie, nikoli o její náhradu.</p>${timerBody}</section>${timerEnd}`;
const homeSection = `${timerBegin}<details id="procesni-casovace" class="process-timers process-timers-dropdown"><summary><span>Živé procesní časovače</span><strong>${registry.timers.length} aktivních časovačů · rozbalit</strong></summary><div class="process-timers-dropdown-body">${timerBody}</div></details>${timerEnd}`;

const assertRequiredTimersRendered = (html, label) => {
  for (const requiredId of REQUIRED_CURRENT_TIMER_IDS) {
    if (!html.includes(`data-timer-id="${requiredId}"`)) throw new Error(`${label}: nevykreslil povinný časovač ${requiredId}`);
  }
};

const injectAssets = html => {
  if (!html.includes(cssTag)) html = html.replace('</head>', `  ${cssTag}\n</head>`);
  if (!html.includes(scriptTag)) html = html.replace('</body>', `  ${scriptTag}\n</body>`);
  return html;
};

let home = removeGeneratedTimerBlock(await readFile(homePath, 'utf8'), 'details');
const homeMarker = '<section class="shared-news-feed"';
if (!home.includes(homeMarker)) throw new Error('Na titulní stránce chybí shared-news-feed pro umístění časovačů');
home = home.replace(homeMarker, `${homeSection}\n${homeMarker}`);
home = injectAssets(home);
assertRequiredTimersRendered(home, 'Titulní stránka');
await writeFile(homePath, home, 'utf8');

let godot = removeGeneratedTimerBlock(await readFile(godotPath, 'utf8'), 'section');
const chronologyMarker = '<ol id="chronologie-seznam">';
if (!godot.includes(chronologyMarker)) throw new Error('Godot nemá hlavní chronologii veřejných institucí');
const chronologyClose = godot.indexOf('</ol>', godot.indexOf(chronologyMarker));
if (chronologyClose < 0) throw new Error('Godot nemá ukončenou hlavní chronologii');
const insertAt = chronologyClose + '</ol>'.length;
godot = godot.slice(0, insertAt) + `\n${godotSection}` + godot.slice(insertAt);
// Starý pomocný blok řízení není pro umístění časovačů potřeba; pokud ještě existuje, odstraní se samostatně.
const legacyDocketsStart = godot.indexOf('<section id="rizeni-online"');
if (legacyDocketsStart >= 0) godot = removeBalancedElement(godot, legacyDocketsStart, 'section');
godot = injectAssets(godot);
assertRequiredTimersRendered(godot, 'Godot');
await writeFile(godotPath, godot, 'utf8');

let eudaArticle = await readFile(eudaArticlePath, 'utf8');
eudaArticle = eudaArticle.replace(/<section id="euda-ack-2026-08-07"[\s\S]*?<\/section>\s*/g, '');
const eudaResponseSection = `<section id="euda-ack-2026-08-07" class="source"><h2>EUDA ještě 7. srpna potvrdila přijetí výzvy</h2><p><b>Kdo:</b> ${escapeHtml(eudaResponse.institution)} — ${escapeHtml(eudaResponse.sender)}</p><p><b>Datum:</b> ${escapeHtml(eudaResponse.date)} ${escapeHtml(eudaResponse.time)}</p><p><b>Č. j. / sp. zn.:</b> ${escapeHtml(eudaResponse.reference)}</p><p><b>Co se stalo:</b> ${escapeHtml(eudaResponse.event)}</p><p><b>Procesní význam:</b> ${escapeHtml(eudaResponse.procedural_effect)}</p><p><a href="${escapeHtml(eudaResponse.evidence_page)}">Otevřít evidenční stránku odpovědi EUDA</a></p></section>`;
const eudaMarker = '<h2 id="dokumenty">';
if (!eudaArticle.includes(eudaMarker)) throw new Error('Článek EUDA nemá marker dokumentů');
eudaArticle = eudaArticle.replace(eudaMarker, `${eudaResponseSection}\n${eudaMarker}`);
await writeFile(eudaArticlePath, eudaArticle, 'utf8');

await mkdir('web/data', { recursive: true });
await writeFile(targetPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
console.log(`Procesní časovače vytvořeny: ${registry.timers.length}; povinné aktuální opravné prostředky: ${REQUIRED_CURRENT_TIMER_IDS.length}; build je idempotentní.`);
