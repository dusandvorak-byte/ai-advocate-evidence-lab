import { mkdir, readFile, writeFile } from 'node:fs/promises';

const sourcePath = 'project-memory/process-timers.json';
const overridesPath = 'project-memory/process-timer-overrides.json';
const currentOverridesPath = 'project-memory/process-timer-overrides-2026-08-12.json';
const documentSourcesPath = 'project-memory/document-sources.json';
const institutionsPath = 'project-memory/institutions.json';
const eudaResponsePath = 'project-memory/euda-response-2026-08-07.json';
const englishTranslationsPath = 'project-memory/english-process-timer-translations.json';
const targetPath = 'web/data/process-timers.json';
const homePath = 'web/index.html';
const englishHomePath = 'web/en.html';
const godotPath = 'web/zpravy/04082026-010.html';
const eudaArticlePath = 'web/zpravy/07082026-011.html';
const cssTag = '<link rel="stylesheet" href="process-timers.css">';
const scriptTag = '<script src="process-timers.js" defer></script>';
const timerBegin = '<!-- PROCESS-TIMERS:BEGIN -->';
const timerEnd = '<!-- PROCESS-TIMERS:END -->';
const remedySince = '2026-07-01';

// Tyto ručně právně kvalifikované časovače zůstávají povinné. Vedle nich se nyní
// automaticky odvozují VŠECHNY další stížnosti, odvolání a rozklady z kanonického registru.
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

const addOneDay = value => {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Nelze vypočítat následující den z ${value}`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

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
const documentSources = JSON.parse(await readFile(documentSourcesPath, 'utf8'));
const institutionsRegistry = JSON.parse(await readFile(institutionsPath, 'utf8'));
const eudaResponse = JSON.parse(await readFile(eudaResponsePath, 'utf8'));
const englishTranslations = JSON.parse(await readFile(englishTranslationsPath, 'utf8'));
if (!Array.isArray(registry.timers) || !Array.isArray(registry.historical_notice_points)) throw new Error('process-timers.json nemá očekávanou strukturu');
if (!Array.isArray(overrides.patches)) throw new Error('process-timer-overrides.json nemá pole patches');
if (!Array.isArray(currentOverrides.patches)) throw new Error('process-timer-overrides-2026-08-12.json nemá pole patches');
if (!Array.isArray(documentSources.sources)) throw new Error('document-sources.json nemá pole sources');
if (!Array.isArray(institutionsRegistry.institutions)) throw new Error('institutions.json nemá pole institutions');
if (!englishTranslations.timers || typeof englishTranslations.timers !== 'object') throw new Error('Anglický registr časovačů nemá objekt timers');

const institutionNames = new Map(institutionsRegistry.institutions.map(item => [item.id, item.name || item.title || item.id]));
const canonicalDocuments = [];
for (const source of documentSources.sources) {
  const parsed = JSON.parse(await readFile(source.path, 'utf8'));
  if (!Array.isArray(parsed.documents)) throw new Error(`${source.path} neobsahuje pole documents`);
  canonicalDocuments.push(...parsed.documents);
}
const documents = [...new Map(canonicalDocuments.map(item => [item.id, item])).values()];
const documentsById = new Map(documents.map(item => [item.id, item]));

const timerMap = new Map(registry.timers.map(item => [item.id, { ...item }]));
for (const patch of [...overrides.patches, ...currentOverrides.patches]) {
  if (!patch.id) throw new Error(`Oprava časovače bez ID: ${JSON.stringify(patch)}`);
  timerMap.set(patch.id, { ...(timerMap.get(patch.id) || {}), ...patch });
}

// Každé naše aktuální podání, které je podle kanonických dat stížností, odvoláním nebo rozkladem,
// MUSÍ mít časovač. Ruční override smí jen zpřesnit právní režim, nikdy rozhodovat o samotné existenci karty.
const remedyPattern = /\b(stížnost|stížnosti|odvolání|rozklad)\b/i;
const outgoing = documents.filter(doc => doc.submission_side === 'outgoing_from_user_or_alliance' && doc.issue_date >= remedySince);
const remedyDocuments = outgoing.filter(doc => {
  const text = [doc.user_title, doc.reference, doc.document_type, ...(doc.topics || [])].filter(Boolean).join(' ');
  return doc.document_type === 'appeal' || remedyPattern.test(text);
});
const manuallyRepresentedDocIds = new Set([...timerMap.values()].map(item => item.source_document_id).filter(Boolean));
const remedyRoutes = new Map([
  ['doc-cz-dvorak-2026-08-14-stiznost-uvk-pp-pcr-ppr-24960', { recipient: 'Policejní prezidium České republiky', for_authority: 'Odbor vnitřní kontroly Policejního prezidia České republiky' }],
  ['doc-cz-dd-2026-08-11-stiznost-15-nt-3103-2026-53', { recipient: 'Okresní soud v Prostějově', for_authority: 'Krajský soud v Brně' }],
  ['doc-cz-dd-2026-08-10-stiznost-15-nt-3105-2026-54', { recipient: 'Okresní soud v Prostějově', for_authority: 'Krajský soud v Brně' }],
  ['doc-cz-dd-2026-08-10-stiznost-necinnost-msp', { recipient: 'Ministerstvo spravedlnosti', for_authority: 'ministr spravedlnosti' }]
]);
for (const doc of remedyDocuments) {
  if (manuallyRepresentedDocIds.has(doc.id)) continue;
  const timerId = `timer-remedy-${doc.id}`;
  const reaction = (doc.relations || []).find(rel => rel.type === 'reakce_na' && rel.target_id);
  const reactionTarget = reaction ? documentsById.get(reaction.target_id) : null;
  const route = remedyRoutes.get(doc.id) || {};
  const recipient = route.recipient
    || (reactionTarget ? institutionNames.get(reactionTarget.institution_id) : null)
    || institutionNames.get(doc.institution_id)
    || doc.institution_id
    || 'příslušný orgán';
  const actor = doc.institution_id === 'CZ-GFAA'
    ? 'Ganja For All Animals, z.s.'
    : doc.institution_id === 'CZ-CITC'
      ? (institutionNames.get('CZ-CITC') || 'Cannabis is The Cure, z.s.')
      : 'Mgr. Dušan Dvořák';
  const href = reaction ? `zpravy/04082026-010.html#${reaction.target_id}` : `listiny/${doc.id}.html`;
  timerMap.set(timerId, {
    id: timerId,
    category: 'current_remedies',
    title: `${recipient} – ${doc.user_title}`,
    recipient,
    ...(route.for_authority ? { for_authority: route.for_authority } : {}),
    actor,
    reference: doc.reference || doc.id,
    start_date: doc.issue_date,
    count_from_date: addOneDay(doc.issue_date),
    start_date_basis: `${doc.user_title}. Podáno a doručeno dne ${doc.issue_date}; tento den je den 0 a následující den je den 1.`,
    status: 'active_derived_remedy',
    limit_kind: 'remedy_regime_requires_verified_override',
    limit_label: 'opravný prostředek – přesná lhůta dle konkrétního procesního režimu',
    legal_basis: 'Přesná lhůta k vyřízení se odvíjí od konkrétního procesního režimu. Bez doložené číselné lhůty se uvádí pouze běh od evidovaného data.',
    source_document_id: doc.id,
    href,
    derived_from_canonical_document: true
  });
}

registry.timers = [...timerMap.values()];
registry.overrides = {
  sources: [overridesPath, currentOverridesPath],
  applied: overrides.patches.length + currentOverrides.patches.length,
  updated_on: currentOverrides.updated_on || overrides.updated_on || null
};
registry.remedy_derivation = {
  source_manifest: documentSourcesPath,
  since: remedySince,
  canonical_remedy_documents: remedyDocuments.length,
  automatically_derived: registry.timers.filter(item => item.derived_from_canonical_document).length
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
for (const requiredId of REQUIRED_CURRENT_TIMER_IDS) if (!ids.has(requiredId)) throw new Error(`Chybí povinný právně kvalifikovaný časovač ${requiredId}`);
for (const doc of remedyDocuments) {
  const represented = registry.timers.some(item => item.source_document_id === doc.id);
  if (!represented) throw new Error(`Kanonický opravný prostředek ${doc.id} nemá časovač`);
}

const labels = {
  current_remedies: 'Aktuální stížnosti, odvolání a rozklady',
  court: 'Justice – soudní řízení',
  pre_action: 'Předžalobní a předprocesní výzvy',
  administrative: 'Správní a informační řízení',
  review_supervision: 'Přezkumy a dohledy',
  criminal_historical: 'Historická trestní důkazní větev'
};
const order = ['current_remedies', 'court', 'pre_action', 'administrative', 'review_supervision', 'criminal_historical'];
const legallyQualifiedPriority = new Set(REQUIRED_CURRENT_TIMER_IDS);

const displayParties = item => {
  const sourceDocument = item.source_document_id ? documentsById.get(item.source_document_id) : null;
  const titleParts = String(item.title || '').split(/\s+[–—]\s+/, 2);
  const recipient = item.recipient || titleParts[0] || 'příslušný orgán';
  const sourceActor = sourceDocument?.submission_side === 'outgoing_from_user_or_alliance'
    ? (sourceDocument.institution_id === 'CZ-GFAA'
      ? 'Ganja For All Animals, z.s.'
      : sourceDocument.institution_id === 'CZ-CITC'
        ? (institutionNames.get('CZ-CITC') || 'Cannabis is The Cure, z.s.')
        : 'Mgr. Dušan Dvořák')
    : (sourceDocument ? institutionNames.get(sourceDocument.institution_id) : null);
  const actor = item.actor
    || sourceActor
    || titleParts[1]
    || 'evidovaný účastník řízení';
  return { recipient, actor };
};

const row = item => {
  const end = item.end_date || '';
  const countStart = item.count_from_date || item.start_date;
  const title = item.href ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
  const due = item.due_date ? ` · konkrétní evidovaný konec: ${escapeHtml(item.due_date)}` : '';
  const history = item.process_history ? `<p class="timer-basis"><b>Průběh:</b> ${escapeHtml(item.process_history)}</p>` : '';
  const nextEvent = item.next_event ? `<p class="timer-basis"><b>Další úkon:</b> ${escapeHtml(item.next_event)}</p>` : '';
  const countNote = item.count_from_date ? `<p class="timer-basis"><b>Den 1 běhu:</b> ${escapeHtml(item.count_from_date)}</p>` : '';
  const { recipient, actor } = displayParties(item);
  const forAuthority = item.for_authority ? `<p class="timer-basis"><b>Pro:</b> ${escapeHtml(item.for_authority)}</p>` : '';
  return `<article class="process-timer" data-process-timer data-limit-kind="${escapeHtml(item.limit_kind || '')}" data-start-date="${escapeHtml(countStart)}" data-event-date="${escapeHtml(item.start_date)}" data-timer-id="${escapeHtml(item.id)}"${item.source_document_id ? ` data-source-document-id="${escapeHtml(item.source_document_id)}"` : ''}${end ? ` data-end-date="${escapeHtml(end)}"` : ''}>
    <div class="timer-value"><span data-elapsed-days>…</span> / <span>${escapeHtml(item.limit_label)}</span></div>
    <div class="timer-detail"><h4>${title}</h4><p class="timer-basis"><b>Kdy:</b> ${escapeHtml(item.start_date)}</p><p class="timer-basis"><b>Komu:</b> ${escapeHtml(recipient)}</p>${forAuthority}<p class="timer-basis"><b>Č. j. / sp. zn.:</b> ${escapeHtml(item.reference)}</p><p class="timer-basis"><b>Kdo:</b> ${escapeHtml(actor)}</p><p class="timer-basis"><b>Co se stalo:</b> ${escapeHtml(item.start_date_basis)}</p>${countNote}<p class="timer-basis"><b>Lhůta / procesní režim:</b> ${escapeHtml(item.legal_basis)}${due}</p>${history}${nextEvent}</div>
  </article>`;
};

const englishEntities = new Map([
  ['Policejní prezidium České republiky', 'Police Presidium of the Czech Republic'],
  ['Odbor vnitřní kontroly Policejního prezidia České republiky', 'Internal Control Office of the Police Presidium'],
  ['Okresní soud v Prostějově', 'Prostějov District Court'], ['Krajský soud v Brně', 'Brno Regional Court'],
  ['Ministerstvo spravedlnosti', 'Ministry of Justice'], ['ministr spravedlnosti', 'Minister of Justice'],
  ['Ministerstvo vnitra', 'Ministry of the Interior'], ['ministr vnitra', 'Minister of the Interior'],
  ['Nejvyšší státní zastupitelství', 'Supreme Public Prosecutor’s Office'],
  ['Úřad pro ochranu osobních údajů', 'Office for Personal Data Protection'],
  ['Městské státní zastupitelství v Praze', 'Prague Municipal Public Prosecutor’s Office'],
  ['Vrchní státní zastupitelství v Praze', 'Prague High Public Prosecutor’s Office'],
  ['příslušný orgán', 'competent authority'], ['evidovaný účastník řízení', 'recorded participant']
]);
const translateEntity = value => englishEntities.get(value) || value;
const englishTimerReference = value => String(value || '')
  .replace(/^mj\. /i, 'including ')
  .replace(/^č\. j\. /i, 'ref. ')
  .replace(/^sp\. zn\. /i, 'case ')
  .replace(/^napadené /i, 'challenged ')
  .replace(/^žádosti /i, 'requests ')
  .replace(/^proti /i, 'against ')
  .replace(/^od /i, 'since ');
const englishRegime = item => {
  if (item.id === 'timer-preaction-euda-2026-08-07') return 'Two months under Article 265 TFEU; acknowledgement of receipt is not itself a substantive position.';
  if (item.id === 'timer-admin-kpr-175-2026-08-03') return '60 days under Section 175(5) of the Czech Code of Administrative Procedure.';
  if (item.id === 'timer-admin-krpt-infz-2026-07-27') return '15 days, extendable by up to 10 days under the Freedom of Information Act; the notified date is 21 August 2026.';
  if (item.id === 'timer-admin-mk-2026-07-22') return 'Basic period of 30 days under Section 71 of the Code of Administrative Procedure, subject to statutory extension in a complex matter.';
  if (item.id === 'timer-admin-mv-rozklad-127234-2026') return '15 working days for the administrative appeal under Section 16(3) of the Freedom of Information Act.';
  if (item.id === 'timer-admin-msz-stiznost-necinnost-2026-07-31' || item.id === 'timer-admin-kpr-repeat-16a-2026-08-10') return 'Seven days for full self-remedy or submission to the superior authority under Section 16a(5) of the Freedom of Information Act.';
  if (item.id === 'timer-admin-nsz-odvolani-sin55-2026' || item.id === 'timer-admin-msz-odvolani-sin48-2026') return 'Following period under the Freedom of Information Act, counted from delivery of the appeal.';
  if (item.id === 'timer-preaction-nsz-2026-07-14') return 'Author-requested checkpoints: interim response by 21 August and final position by 11 September 2026; these are not general statutory periods.';
  if (item.category === 'court') return 'No universal fixed statutory number of days for the merits decision is recorded; the proceeding must be conducted without undue delay.';
  if (item.category === 'review_supervision') return 'No universal fixed statutory number of days for completion of this review or supervision is documented.';
  if (item.category === 'criminal_historical') return 'Historical evidence branch; the timer does not prove an offence or inactivity in every individual filing.';
  if (item.category === 'current_remedies') return 'The exact period depends on the applicable procedural regime; without a documented numerical period, only elapsed time is shown.';
  return 'The applicable period depends on the documented procedural regime.';
};
const englishRow = item => {
  const translation = englishTranslations.timers[item.id];
  if (!translation?.title || !translation?.event) throw new Error(`Missing complete English timer translation: ${item.id}`);
  const countStart = item.count_from_date || item.start_date;
  const end = item.end_date || '';
  const { recipient, actor } = displayParties(item);
  const linkHref = item.source_document_id ? `news/04082026-010.html#en-${item.source_document_id}` : 'news/04082026-010.html#chronology';
  const forAuthority = item.for_authority ? `<p class="timer-basis"><b>For:</b> ${escapeHtml(translateEntity(item.for_authority))}</p>` : '';
  return `<article class="process-timer" data-process-timer data-limit-kind="${escapeHtml(item.limit_kind || '')}" data-start-date="${escapeHtml(countStart)}" data-event-date="${escapeHtml(item.start_date)}" data-timer-id="${escapeHtml(item.id)}"${item.source_document_id ? ` data-source-document-id="${escapeHtml(item.source_document_id)}"` : ''}${end ? ` data-end-date="${escapeHtml(end)}"` : ''}><div class="timer-value"><span data-elapsed-days>…</span> / <span>days tracked</span></div><div class="timer-detail"><h4><a href="${linkHref}">${escapeHtml(translation.title)}</a></h4><p class="timer-basis"><b>When:</b> ${escapeHtml(item.start_date)}</p><p class="timer-basis"><b>To:</b> ${escapeHtml(translateEntity(recipient))}</p>${forAuthority}<p class="timer-basis"><b>Reference:</b> ${escapeHtml(englishTimerReference(item.reference))}</p><p class="timer-basis"><b>From:</b> ${escapeHtml(translateEntity(actor))}</p><p class="timer-basis"><b>What happened:</b> ${escapeHtml(translation.event)}</p>${item.count_from_date ? `<p class="timer-basis"><b>Day 1:</b> ${escapeHtml(item.count_from_date)}</p>` : ''}<p class="timer-basis"><b>Time limit / procedural regime:</b> ${escapeHtml(englishRegime(item))}</p></div></article>`;
};

// Právně kvalifikované ruční časovače se zobrazí v témže prioritním bloku, ale ne podruhé v administrativní sekci.
const derivedPriority = registry.timers.filter(item => item.category === 'current_remedies');
const manualPriority = registry.timers.filter(item => legallyQualifiedPriority.has(item.id));
const priorityTimers = [...new Map([...derivedPriority, ...manualPriority].map(item => [item.id, item])).values()]
  .sort((a, b) => b.start_date.localeCompare(a.start_date) || a.title.localeCompare(b.title, 'cs'));
const regularTimers = registry.timers.filter(item => item.category !== 'current_remedies' && !legallyQualifiedPriority.has(item.id));

const prioritySection = `<section class="timer-category timer-category-priority" data-timer-category="current-remedies"><h3>Aktuální stížnosti, odvolání a rozklady <span class="timer-category-count">(${priorityTimers.length})</span></h3><div class="timer-grid">${priorityTimers.map(row).join('')}</div></section>`;
const categories = order.filter(category => category !== 'current_remedies').map(category => {
  const items = regularTimers.filter(item => item.category === category);
  if (!items.length) return '';
  return `<section class="timer-category" data-timer-category="${category}"><h3>${escapeHtml(labels[category] || category)} <span class="timer-category-count">(${items.length})</span></h3><div class="timer-grid">${items.map(row).join('')}</div></section>`;
}).join('');

const notices = registry.historical_notice_points.map(item => `<article class="historical-notice"><h4>${escapeHtml(item.date)} · ${escapeHtml(item.title)}</h4><p>${escapeHtml(item.evidence)}</p><p><b>Význam pro projekt:</b> ${escapeHtml(item.boundary)}</p></article>`).join('');
const timerBody = `${prioritySection}${categories}<h3>Historický společný referenční bod vědomosti státu</h3>${notices}`;
const englishCategoryLabels = { current_remedies: 'Current complaints and appeals', court: 'Courts', pre_action: 'Pre-action and preliminary demands', administrative: 'Administrative and information proceedings', review_supervision: 'Reviews and supervision', criminal_historical: 'Historical criminal-evidence branch' };
const englishSections = order.map(category => {
  const items = category === 'current_remedies' ? priorityTimers : regularTimers.filter(item => item.category === category);
  if (!items.length) return '';
  return `<section class="timer-category${category === 'current_remedies' ? ' timer-category-priority' : ''}" data-timer-category="${category}"><h3>${englishCategoryLabels[category]} <span class="timer-category-count">(${items.length})</span></h3><div class="timer-grid">${items.map(englishRow).join('')}</div></section>`;
}).join('');
const englishHomeSection = `${timerBegin}<details id="procesni-casovace" class="process-timers process-timers-dropdown"><summary><span>Live procedural timers</span><strong>${registry.timers.length} active timers · expand</strong></summary><div class="process-timers-dropdown-body">${englishSections}</div></details>${timerEnd}`;
const godotSection = `${timerBegin}<section id="procesni-casovace" class="process-timers"><header><div><p class="section-label">DŮSLEDKY · ŽIVÉ PROCESNÍ ČASOVAČE</p><h2>Živé procesní časovače</h2></div></header><p class="timer-legend">Tento blok následuje až po chronologii listin veřejných institucí od 1. května 2026. Jde o odvozené procesní důsledky chronologie, nikoli o její náhradu.</p>${timerBody}</section>${timerEnd}`;
const homeSection = `${timerBegin}<details id="procesni-casovace" class="process-timers process-timers-dropdown"><summary><span>Živé procesní časovače</span><strong>${registry.timers.length} aktivních časovačů · rozbalit</strong></summary><div class="process-timers-dropdown-body">${timerBody}</div></details>${timerEnd}`;

const assertRequiredTimersRendered = (html, label) => {
  for (const item of priorityTimers) if (!html.includes(`data-timer-id="${item.id}"`)) throw new Error(`${label}: nevykreslil aktuální opravný prostředek ${item.id}`);
  for (const doc of remedyDocuments) if (!html.includes(`data-source-document-id="${doc.id}"`)) throw new Error(`${label}: nevykreslil kanonický opravný prostředek ${doc.id}`);
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

let englishHome = removeGeneratedTimerBlock(await readFile(englishHomePath, 'utf8'), 'details');
if (!englishHome.includes(homeMarker)) throw new Error('English front page has no shared-news-feed marker for timers');
englishHome = englishHome.replace(homeMarker, `${englishHomeSection}\n${homeMarker}`);
englishHome = injectAssets(englishHome);
assertRequiredTimersRendered(englishHome, 'English front page');
await writeFile(englishHomePath, englishHome, 'utf8');

let godot = removeGeneratedTimerBlock(await readFile(godotPath, 'utf8'), 'section');
const chronologyMarker = '<ol id="chronologie-seznam">';
if (!godot.includes(chronologyMarker)) throw new Error('Godot nemá hlavní chronologii veřejných institucí');
const chronologyClose = godot.indexOf('</ol>', godot.indexOf(chronologyMarker));
if (chronologyClose < 0) throw new Error('Godot nemá ukončenou hlavní chronologii');
const insertAt = chronologyClose + '</ol>'.length;
godot = godot.slice(0, insertAt) + `\n${godotSection}` + godot.slice(insertAt);
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
console.log(`Procesní časovače: ${registry.timers.length}; aktuální opravné prostředky v prioritním bloku: ${priorityTimers.length}; kanonicky nalezeno: ${remedyDocuments.length}; build kontroluje úplnost automaticky.`);
