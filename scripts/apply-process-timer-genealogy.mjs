import { readFile, writeFile } from 'node:fs/promises';

const timerDataPath = 'web/data/process-timers.json';
const documentSourcesPath = 'project-memory/document-sources.json';
const htmlPaths = ['web/index.html', 'web/en.html', 'web/zpravy/04082026-010.html', 'web/news/04082026-010.html'];
const liveDocketsPath = 'web/live-dockets.js';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const uniqueSorted = values => [...new Set(values.filter(Boolean))].sort();
const formatCzDate = iso => {
  const [y,m,d] = iso.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
};
const formatEnDate = iso => new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const sourceManifest = JSON.parse(await readFile(documentSourcesPath, 'utf8'));
const docs = [];
for (const source of sourceManifest.sources || []) {
  const parsed = JSON.parse(await readFile(source.path, 'utf8'));
  for (const doc of parsed.documents || []) docs.push(doc);
}
const documents = [...new Map(docs.map(doc => [doc.id, doc])).values()];
const outgoing = documents.filter(doc => doc.submission_side === 'outgoing_from_user_or_alliance');
const docText = doc => [doc.user_title, doc.reference, doc.document_type, ...(doc.topics || []), ...(doc.case_ids || [])].filter(Boolean).join(' ').toLocaleLowerCase('cs-CZ');
const datesMatching = predicate => uniqueSorted(outgoing.filter(predicate).map(doc => doc.issue_date));
const mergeDates = (...sets) => uniqueSorted(sets.flat());

const nszDates = mergeDates(
  ['2026-07-14','2026-07-25','2026-07-27','2026-07-29','2026-08-01','2026-08-15','2026-08-22','2026-08-28'],
  datesMatching(doc => doc.issue_date >= '2026-07-14' && /6 nzn 1737\/2026|předžalobní výzv/.test(docText(doc)))
);
const ministerDates = mergeDates(['2026-08-15','2026-08-24'], datesMatching(doc => /ministr.*vnitra|ministerstvo vnitra/.test(docText(doc)) && /stížnost|doplnění/.test(docText(doc)) && doc.issue_date >= '2026-08-15'));
const policePresidentDates = mergeDates(['2026-08-15','2026-08-24'], datesMatching(doc => /policejní prezident|policejního prezident/.test(docText(doc)) && /stížnost|přezkum|doplnění/.test(docText(doc)) && doc.issue_date >= '2026-08-15'));
const gibsDates = mergeDates(['2026-08-15','2026-08-24'], datesMatching(doc => /gibs|generální inspekce bezpečnostních sborů/.test(docText(doc)) && doc.issue_date >= '2026-08-15'));
const vszPrahaDates = mergeDates(['2026-06-22','2026-08-15','2026-08-25','2026-08-27','2026-08-28'], datesMatching(doc => /vsz praha|vrchní státní zastupitelství v praze|1 vzn 1678\/2026/.test(docText(doc)) && /dohled|přezkum|doplnění/.test(docText(doc))));
const vszOlomoucDates = mergeDates(['2026-07-10','2026-08-15'], datesMatching(doc => /vsz olomouc|vrchní státní zastupitelství v olomouci|3 vzn 239\/2026/.test(docText(doc)) && /dohled|přezkum|doplnění/.test(docText(doc))));
const kpr175Dates = mergeDates(['2026-08-03'], datesMatching(doc => /kpr 5080\/2026/.test(docText(doc)) && /§ 175|stížnost podle § 175|doplnění stížnosti/.test(docText(doc))));

const timerRegistry = JSON.parse(await readFile(timerDataPath, 'utf8'));
const byId = new Map((timerRegistry.timers || []).map(item => [item.id, item]));
const suppress = new Set([
  'timer-admin-msz-odvolani-sin48-2026',
  'timer-admin-msz-stiznost-necinnost-2026-07-31'
]);

const patch = (id, values) => {
  const current = byId.get(id);
  if (!current) throw new Error(`GENEALOGY-GATE: chybí časovač ${id}`);
  byId.set(id, { ...current, ...values });
};
const datesCz = dates => dates.map(formatCzDate).join(' → ');
const datesEn = dates => dates.map(formatEnDate).join(' → ');

patch('timer-preaction-nsz-2026-07-14', {
  title: 'NSZ – předžalobní výzva ze dne 14. 7. 2026 a její dodatky',
  reference: '6 NZN 1737/2026',
  start_date: '2026-07-14',
  start_date_basis: 'Předžalobní výzva byla podána 14. 7. 2026. Další podání se vedou jako dodatky téže procesní větve, nikoli jako samostatné časovače.',
  process_history: `Datace procesní větve: ${datesCz(nszDates)}.`,
  status: 'active_genealogy',
  limit_kind: 'author_set_specific_date',
  limit_label: 'nejzazší dobrovolný termín pro konečné stanovisko 11. 9. 2026',
  due_date: '2026-09-11'
});
patch('timer-admin-kpr-175-2026-08-03', {
  process_history: `Stížnost podle § 175: ${datesCz(kpr175Dates)}. Další kvalifikovaná doplnění se připojují do tohoto jediného uzlu.`
});
patch('timer-review-vsz-praha-1vzn1678-2026', {
  title: 'VSZ Praha – dohledy a přezkumy v jedné procesní větvi',
  process_history: `Datace podání, dohledů, přezkumů a doplnění: ${datesCz(vszPrahaDates)}.`
});
patch('timer-review-vsz-olomouc-2026-07-10', {
  title: 'VSZ Olomouc – dohledy a přezkumy v jedné procesní větvi',
  process_history: `Datace podání, dohledů, přezkumů a doplnění: ${datesCz(vszOlomoucDates)}.`
});
for (const [id, dates, label] of [
  ['timer-remedy-doc-cz-dd-2026-08-15-doplneni-stiznosti-ministr-vnitra', ministerDates, 'Stížnost ministrovi vnitra'],
  ['timer-remedy-doc-cz-dd-2026-08-15-zadost-prezkum-policejni-prezident', policePresidentDates, 'Stížnost / přezkum policejnímu prezidentovi'],
  ['timer-remedy-doc-cz-dd-2026-08-15-podnet-gibs', gibsDates, 'Podnět / stížnost GIBS']
]) {
  if (byId.has(id)) patch(id, { process_history: `${label}: ${datesCz(dates)}. Další doplnění patří do stejné procesní větve.` });
}

patch('timer-court-8ad9-2026', {
  title: 'MS v Praze – nová zásahová žaloba proti SÚKL; navazuje na 8 Ad 9/2026',
  reference: 'nová žaloba 31. 8. 2026 · souvisící 8 Ad 9/2026-85',
  start_date: '2026-08-31',
  start_date_basis: 'Původní řízení 8 Ad 9/2026 skončilo usnesením Městského soudu v Praze ze dne 28. 8. 2026, č. j. 8 Ad 9/2026-85. Dne 31. 8. 2026 byla podána nová zásahová žaloba proti SÚKL, která na tuto větev výslovně navazuje.',
  process_history: '31. 5. 2026 žaloba proti MZ → 28. 8. 2026 usnesení 8 Ad 9/2026-85, původní žaloba odmítnuta → 31. 8. 2026 nová zásahová žaloba proti SÚKL.',
  status: 'active_successor_court_case',
  limit_kind: 'no_fixed_numeric_statutory_deadline',
  limit_label: 'nová zásahová žaloba proti SÚKL – aktivní soudní řízení',
  legal_basis: '§ 82 a násl. s. ř. s.; aktivní je nová žaloba z 31. 8. 2026, nikoli skončené řízení 8 Ad 9/2026',
  href: 'zpravy/04082026-010.html#procesni-casovace'
});
patch('timer-court-mv-2026-07-23', {
  title: 'NSS – kasační stížnost ve věci 15 A 44/2026 proti Ministerstvu vnitra',
  reference: '15 A 44/2026-43 · kasační stížnost 1. 9. 2026',
  start_date: '2026-09-01',
  start_date_basis: 'Městský soud v Praze usnesením ze dne 25. 8. 2026, č. j. 15 A 44/2026-43, žalobu odmítl. Dne 1. 9. 2026 byla proti tomuto usnesení podána kasační stížnost k Nejvyššímu správnímu soudu.',
  process_history: '23. 7. 2026 zásahová žaloba proti Ministerstvu vnitra → 25. 8. 2026 usnesení 15 A 44/2026-43, žaloba odmítnuta → 1. 9. 2026 kasační stížnost k NSS.',
  status: 'active_cassation_stage',
  limit_kind: 'cassation_pending',
  limit_label: 'kasační řízení před NSS – aktivní procesní krok',
  legal_basis: '§ 102 a násl. s. ř. s.; původní žaloba již není aktivním krokem, aktivní je podaná kasační stížnost',
  href: 'zpravy/04082026-010.html#procesni-casovace'
});

for (const id of suppress) byId.delete(id);
timerRegistry.timers = [...byId.values()];
timerRegistry.lifecycle = {
  updated_on: '2026-09-02',
  rule: 'one active timer per procedural branch; decided steps remain only in process history',
  suppressed_resolved_timers: [...suppress],
  nsz_addendum_dates: nszDates,
  minister_complaint_dates: ministerDates,
  police_president_dates: policePresidentDates,
  gibs_dates: gibsDates,
  vsz_praha_dates: vszPrahaDates,
  vsz_olomouc_dates: vszOlomoucDates,
  kpr_175_dates: kpr175Dates
};
await writeFile(timerDataPath, `${JSON.stringify(timerRegistry, null, 2)}\n`, 'utf8');

const articleRe = id => new RegExp(`<article class="process-timer"[^>]*data-timer-id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?<\\/article>`, 'g');
const renderCz = item => `<article class="process-timer" data-process-timer data-limit-kind="${escapeHtml(item.limit_kind)}" data-start-date="${escapeHtml(item.start_date)}" data-event-date="${escapeHtml(item.start_date)}" data-timer-id="${escapeHtml(item.id)}"><div class="timer-value"><span data-elapsed-days>…</span> / <span>${escapeHtml(item.limit_label)}</span></div><div class="timer-detail"><h4><a href="${escapeHtml(item.href || 'zpravy/04082026-010.html#procesni-casovace')}">${escapeHtml(item.title)}</a></h4><p class="timer-basis"><b>Kdy:</b> ${escapeHtml(item.start_date)}</p><p class="timer-basis"><b>Č. j. / sp. zn.:</b> ${escapeHtml(item.reference)}</p><p class="timer-basis"><b>Co se stalo:</b> ${escapeHtml(item.start_date_basis)}</p><p class="timer-basis"><b>Lhůta / procesní režim:</b> ${escapeHtml(item.legal_basis)}</p>${item.process_history ? `<p class="timer-basis"><b>Průběh:</b> ${escapeHtml(item.process_history)}</p>` : ''}</div></article>`;
const enOverrides = {
  'timer-preaction-nsz-2026-07-14': { title:'Supreme Public Prosecutor’s Office – pre-action demand of 14 July 2026 and addenda', event:`One procedural branch. Dates: ${datesEn(nszDates)}.`, regime:'Latest voluntary deadline for the final position: 11 September 2026.' },
  'timer-admin-kpr-175-2026-08-03': { title:'Office of the President – complaint under Section 175 and addenda', event:`Complaint/addenda dates: ${datesEn(kpr175Dates)}.`, regime:'One active complaint branch; later supplements do not create duplicate timers.' },
  'timer-review-vsz-praha-1vzn1678-2026': { title:'Prague High Public Prosecutor’s Office – supervision/review branch', event:`Filing and supplement dates: ${datesEn(vszPrahaDates)}.`, regime:'One active supervision/review branch.' },
  'timer-review-vsz-olomouc-2026-07-10': { title:'Olomouc High Public Prosecutor’s Office – supervision/review branch', event:`Filing and supplement dates: ${datesEn(vszOlomoucDates)}.`, regime:'One active supervision/review branch.' },
  'timer-court-8ad9-2026': { title:'Prague Municipal Court – new intervention action against SÚKL, following case 8 Ad 9/2026', event:'The earlier case ended on 28 August 2026. A new intervention action against SÚKL was filed on 31 August 2026 and expressly follows that procedural branch.', regime:'Active step: the new action filed on 31 August 2026.' },
  'timer-court-mv-2026-07-23': { title:'Supreme Administrative Court – cassation complaint in case 15 A 44/2026', event:'The Prague Municipal Court rejected the action by order 15 A 44/2026-43 on 25 August 2026. A cassation complaint was filed on 1 September 2026.', regime:'Active step: cassation proceedings before the Supreme Administrative Court.' },
  'timer-remedy-doc-cz-dd-2026-08-15-doplneni-stiznosti-ministr-vnitra': { title:'Minister of the Interior – complaint branch and supplements', event:`Dates: ${datesEn(ministerDates)}.`, regime:'One active complaint branch.' },
  'timer-remedy-doc-cz-dd-2026-08-15-zadost-prezkum-policejni-prezident': { title:'Police President – review/complaint branch and supplements', event:`Dates: ${datesEn(policePresidentDates)}.`, regime:'One active review branch.' },
  'timer-remedy-doc-cz-dd-2026-08-15-podnet-gibs': { title:'General Inspection of Security Forces – filing and supplements', event:`Dates: ${datesEn(gibsDates)}.`, regime:'One active filing branch.' }
};
const renderEn = (item, text) => `<article class="process-timer" data-process-timer data-limit-kind="${escapeHtml(item.limit_kind)}" data-start-date="${escapeHtml(item.start_date)}" data-event-date="${escapeHtml(item.start_date)}" data-timer-id="${escapeHtml(item.id)}"><div class="timer-value"><span data-elapsed-days>…</span> / <span>days tracked</span></div><div class="timer-detail"><h4><a href="news/04082026-010.html#chronology">${escapeHtml(text.title)}</a></h4><p class="timer-basis"><b>When:</b> ${escapeHtml(item.start_date)}</p><p class="timer-basis"><b>Reference:</b> ${escapeHtml(item.reference)}</p><p class="timer-basis"><b>What happened:</b> ${escapeHtml(text.event)}</p><p class="timer-basis"><b>Time limit / procedural regime:</b> ${escapeHtml(text.regime)}</p></div></article>`;

const patchIds = [...Object.keys(enOverrides)];
for (const path of htmlPaths) {
  let html = await readFile(path, 'utf8');
  for (const id of suppress) html = html.replace(articleRe(id), '');
  const english = path.includes('/en.html') || path.includes('/news/');
  for (const id of patchIds) {
    const item = byId.get(id);
    if (!item) continue;
    const re = articleRe(id);
    if (!re.test(html)) continue;
    re.lastIndex = 0;
    html = html.replace(re, english ? renderEn(item, enOverrides[id]) : renderCz(item));
  }
  for (const id of suppress) if (html.includes(`data-timer-id="${id}"`)) throw new Error(`GENEALOGY-GATE: ${path} stále obsahuje uzavřený časovač ${id}`);
  await writeFile(path, html, 'utf8');
}

let liveDockets = await readFile(liveDocketsPath, 'utf8');
liveDockets = liveDockets
  .replace("['2026-05-31', 'Městský soud v Praze, sp. zn. 8 Ad 9/2026 – Ministerstvo zdravotnictví', 'Prague Municipal Court, case 8 Ad 9/2026 – Ministry of Health', 'case-cz-ms-praha-8ad9-2026'],", "['2026-08-31', 'Městský soud v Praze – nová zásahová žaloba proti SÚKL (navazuje na 8 Ad 9/2026)', 'Prague Municipal Court – new intervention action against SÚKL (following 8 Ad 9/2026)', 'procesni-casovace'],")
  .replace("['2026-07-23', 'Městský soud v Praze, sp. zn. 15 A 44/2026 – Ministerstvo vnitra', 'Prague Municipal Court, case 15 A 44/2026 – Ministry of the Interior', 'case-cz-ms-praha-15a44-2026']", "['2026-09-01', 'Nejvyšší správní soud – kasační stížnost ve věci 15 A 44/2026', 'Supreme Administrative Court – cassation complaint in case 15 A 44/2026', 'procesni-casovace']");
if (liveDockets.includes("['2026-05-31', 'Městský soud v Praze, sp. zn. 8 Ad 9/2026")) throw new Error('GENEALOGY-GATE: aktivní soudní seznam stále vede skončené 8 Ad 9/2026');
await writeFile(liveDocketsPath, liveDockets, 'utf8');

console.log(`Procesní genealogie: odstraněny ${suppress.size} uzavřené MSZ/InfZ časovače; NSZ dodatky ${nszDates.length}; VSZ Praha ${vszPrahaDates.length}; VSZ Olomouc ${vszOlomoucDates.length}; 8 Ad 9/2026 nahrazeno aktivní žalobou SÚKL; 15 A 44/2026 převedeno do kasační fáze.`);
