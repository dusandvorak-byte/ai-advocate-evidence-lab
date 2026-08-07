import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const sourcePath = 'project-memory/process-timers.json';
const targetPath = 'web/data/process-timers.json';
const homePath = 'web/index.html';
const godotPath = 'web/zpravy/04082026-010.html';
const cssTag = '<link rel="stylesheet" href="process-timers.css">';
const scriptTag = '<script src="process-timers.js" defer></script>';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const registry = JSON.parse(await readFile(sourcePath, 'utf8'));
if (!Array.isArray(registry.timers) || !Array.isArray(registry.historical_notice_points)) {
  throw new Error('process-timers.json nemá očekávanou strukturu');
}
const ids = new Set();
for (const item of registry.timers) {
  if (!item.id || !item.category || !item.title || !item.limit_label) throw new Error(`Neúplný procesní časovač: ${JSON.stringify(item)}`);
  if (ids.has(item.id)) throw new Error(`Duplicitní ID časovače: ${item.id}`);
  ids.add(item.id);
  if (item.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(item.start_date)) throw new Error(`Neplatné datum časovače ${item.id}`);
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
  const start = item.start_date || '';
  const end = item.end_date || '';
  const title = item.href ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
  const due = item.due_date ? ` · konkrétní evidovaný konec: ${escapeHtml(item.due_date)}` : '';
  return `<article class="process-timer" data-process-timer data-start-date="${escapeHtml(start)}"${end ? ` data-end-date="${escapeHtml(end)}"` : ''}>
    <div class="timer-value"><span data-elapsed-days>…</span> / <span>${escapeHtml(item.limit_label)}</span></div>
    <div class="timer-detail"><h4>${title}</h4><p>${escapeHtml(item.reference || '')}</p><p class="timer-basis"><b>Počátek:</b> ${escapeHtml(item.start_date || 'k ověření')} · ${escapeHtml(item.start_date_basis || '')}</p><p class="timer-basis"><b>Pravá strana časovače:</b> ${escapeHtml(item.legal_basis || '')}${due}</p></div>
  </article>`;
};

const categories = order.map(category => {
  const items = registry.timers.filter(item => item.category === category);
  if (!items.length) return '';
  return `<section class="timer-category" data-timer-category="${category}"><h3>${escapeHtml(labels[category] || category)} <span class="timer-category-count">(${items.length})</span></h3><div class="timer-grid">${items.map(row).join('')}</div></section>`;
}).join('');

const notices = registry.historical_notice_points.map(item => `<article class="historical-notice"><h4>${escapeHtml(item.date)} · ${escapeHtml(item.title)}</h4><p>${escapeHtml(item.evidence)}</p><p><b>Význam pro projekt:</b> ${escapeHtml(item.boundary)}</p></article>`).join('');

const section = `<section id="procesni-casovace" class="process-timers"><header><div><p class="section-label">ŽIVÉ PROCESNÍ ČASOVAČE</p><h2>Procesní časovače</h2></div></header><p class="timer-legend"><b>Formát:</b> počet dnů od doloženého počátku do dne otevření webu / doložená zákonná nebo procesní lhůta. Pokud pevná číselná lhůta není, web ji nevymýšlí a uvede to výslovně.</p>${categories}<h3>Historický společný referenční bod vědomosti státu</h3>${notices}</section>`;

const injectAssets = html => {
  if (!html.includes(cssTag)) html = html.replace('</head>', `  ${cssTag}\n</head>`);
  if (!html.includes(scriptTag)) html = html.replace('</body>', `  ${scriptTag}\n</body>`);
  return html;
};

let home = await readFile(homePath, 'utf8');
home = home.replace(/<section id="procesni-casovace"[\s\S]*?<\/section>\s*/g, '');
const homeMarker = '<section id="live-dockets"';
if (!home.includes(homeMarker)) throw new Error('Na titulní stránce chybí live-dockets');
home = home.replace(homeMarker, `${section}\n${homeMarker}`);
home = injectAssets(home);
await writeFile(homePath, home, 'utf8');

let godot = await readFile(godotPath, 'utf8');
godot = godot.replace(/<section id="procesni-casovace"[\s\S]*?<\/section>\s*/g, '');
const godotMarker = '<h2 id="chronologie">';
if (!godot.includes(godotMarker)) throw new Error('Godot nemá chronologický marker');
godot = godot.replace(godotMarker, `${section}\n${godotMarker}`);
godot = injectAssets(godot);
await writeFile(godotPath, godot, 'utf8');

await mkdir('web/data', { recursive: true });
await copyFile(sourcePath, targetPath);
console.log(`Procesní časovače vytvořeny: ${registry.timers.length}; historické body: ${registry.historical_notice_points.length}.`);
