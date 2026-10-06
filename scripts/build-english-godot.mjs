import { readFile, writeFile } from 'node:fs/promises';

const documentManifestPath = 'project-memory/document-sources.json';
const institutionsPath = 'project-memory/institutions.json';
const translationsPath = 'project-memory/english-godot-translations.json';
const timersPath = 'web/data/process-timers.json';
const targetPath = 'web/news/04082026-010.html';
const mainFrom = '2026-05-01';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const formatDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'date not recorded';
  const [year, month, day] = value.split('-');
  return `${Number(day)} ${['January','February','March','April','May','June','July','August','September','October','November','December'][Number(month) - 1]} ${year}`;
};

const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^web\//, '');
const referenceText = item => String(item.reference || '').trim() || 'no separate reference number recorded';
const englishReferenceText = item => referenceText(item)
  .replace(/^bez samostatného č\. j\.\/sp\. zn\. v e-mailu$/i, 'no separate reference number in the email')
  .replace(/^odvolání proti /i, 'appeal against ')
  .replace(/^Rozklad k /i, 'administrative appeal against ')
  .replace(/^Příloha k /i, 'Annex to ')
  .replace(/^proti /i, 'against ')
  .replace(/^stížnost podle § 16a InfZ – žádosti /i, 'complaint under Section 16a of the Freedom of Information Act – requests ');
const compareDocuments = (a, b) => String(b.issue_date).localeCompare(String(a.issue_date)) || String(b.id).localeCompare(String(a.id));

const manifest = JSON.parse(await readFile(documentManifestPath, 'utf8'));
const institutions = JSON.parse(await readFile(institutionsPath, 'utf8'));
const translations = JSON.parse(await readFile(translationsPath, 'utf8'));
const timers = JSON.parse(await readFile(timersPath, 'utf8'));
if (!Array.isArray(manifest.sources) || !Array.isArray(institutions.institutions) || !Array.isArray(timers.timers)) throw new Error('English Godot source registry has an invalid structure');

const allDocuments = [];
for (const source of manifest.sources) {
  const registry = JSON.parse(await readFile(source.path, 'utf8'));
  if (!Array.isArray(registry.documents)) throw new Error(`${source.path} has no documents array`);
  allDocuments.push(...registry.documents);
}
const documents = [...new Map(allDocuments.map(item => [item.id, item])).values()];
const documentsById = new Map(documents.map(item => [item.id, item]));
const stateDocuments = documents
  .filter(item => item.issue_date >= mainFrom && item.document_type !== 'state_record_attachment' && (item.submission_side === 'incoming_from_state_or_public_institution' || item.document_type === 'state_record'))
  .sort(compareDocuments);
const outgoingDocuments = documents
  .filter(item => item.issue_date >= mainFrom && item.submission_side === 'outgoing_from_user_or_alliance')
  .sort(compareDocuments);
if (!stateDocuments.length) throw new Error('English Godot contains no state/public/international records');

const usedInstitutionIds = new Set([...stateDocuments, ...outgoingDocuments].map(item => item.institution_id));
for (const id of usedInstitutionIds) if (!translations.institutions?.[id]) throw new Error(`Missing English institution name: ${id}`);
for (const item of stateDocuments) if (!translations.documents?.[item.id]) throw new Error(`Missing English document description: ${item.id}`);

const sourceLink = item => {
  const published = item.public || {};
  if (published.pdf) {
    const href = publicPath(published.pdf);
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">PDF document</a>`;
  }
  if (published.html) return `<a href="${escapeHtml(publicPath(published.html))}">Evidence page</a>`;
  return `<a href="listiny/${escapeHtml(item.id)}.html">Evidence page</a>`;
};

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
    const title = translations.documents?.[item.id] || item.user_title;
    return `<span id="en-${escapeHtml(item.id)}" class="state-love-related" data-related-document-id="${escapeHtml(item.id)}"><b>${escapeHtml(formatDate(item.issue_date))}</b> · ${escapeHtml(title)} · ${sourceLink(item)}</span>`;
  }).join('<br>');
};

const chronologyDocuments = stateDocuments;
const chronologyRow = (item, index) => {
  const institution = translations.institutions[item.institution_id] || item.institution_id;
  const number = chronologyDocuments.length - index;
  return `<tr id="en-${escapeHtml(item.id)}" data-document-id="${escapeHtml(item.id)}" data-row-number="${number}" data-issue-date="${escapeHtml(item.issue_date)}" data-submission-side="incoming_from_state_or_public_institution"><td class="slalom-number">${number}</td><td><time datetime="${escapeHtml(item.issue_date)}">${escapeHtml(formatDate(item.issue_date))}</time></td><td>${escapeHtml(institution)}</td><td>${escapeHtml(englishReferenceText(item))}</td><td>${escapeHtml(translations.documents[item.id])} · ${sourceLink(item)}</td><td class="state-love-relation-cell">${renderRelated(filingsForState(item))}</td><td class="state-love-relation-cell">${renderRelated(remediesForState(item))}</td></tr>`;
};

const relatedOutgoingIds = new Set(stateDocuments.flatMap(item => [...filingsForState(item), ...remediesForState(item)].map(doc => doc.id)));
const hiddenOutgoingAnchors = outgoingDocuments
  .filter(item => !relatedOutgoingIds.has(item.id))
  .map(item => `<span id="en-${escapeHtml(item.id)}" hidden aria-hidden="true"></span>`)
  .join('');

const chronology = `<section class="justice-slalom-shell state-love-shell" aria-label="A time for the state to love"><details class="home-rollup justice-slalom state-love-panel" open><summary><span class="rollup-title">A time for the state to love</span><span class="rollup-prompt">responses from public and international authorities</span><span class="rollup-heart" aria-hidden="true">❤️</span><b class="rollup-action">Expand ↓</b></summary><div class="justice-slalom-body"><p class="justice-slalom-intro">${chronologyDocuments.length} authority responses · newest on top · the oldest response is No. 1.</p><div class="justice-slalom-scroll state-love-scroll"><table id="en-chronology-list" class="state-love-table" data-english-chronology-count="${chronologyDocuments.length}"><thead><tr><th scope="col">No.</th><th scope="col">Date</th><th scope="col">Authority</th><th scope="col">Ref./case no.</th><th scope="col">What happened</th><th scope="col">What the authority responded to</th><th scope="col">Objection / remedy</th></tr></thead><tbody>${chronologyDocuments.map(chronologyRow).join('')}</tbody></table></div></div></details></section>`;
const courtProceedings = [
  ['2025-07-29', 'case-cz-ms-praha-45t1-2024', 'Prague Municipal Court, case 45 T 1/2024 – returned by the Prague High Court'],
  ['2026-05-01', 'case-cz-ms-praha-18a17-2026', 'Prague Municipal Court, case 18 A 17/2026 – National Centre against Organised Crime'],
  ['2026-05-31', 'case-cz-ms-praha-8ad9-2026', 'Prague Municipal Court, case 8 Ad 9/2026 – Ministry of Health'],
  ['2026-06-04', 'case-cz-os-praha4-10c69-2026', 'Prague 4 District Court, case 10 C 69/2026 – Czech Television'],
  ['2026-06-15', 'case-cz-ms-praha-18a23-2026', 'Prague Municipal Court, case 18 A 23/2026 – Ministry of Justice'],
  ['2026-07-12', 'case-cz-os-pro-2t104-2010-obnova', 'Prostějov District Court, case 2 T 104/2010 – reopening'],
  ['2026-07-12', 'case-cz-os-pro-prevence-2026', 'Prostějov District Court – preventive filing 2026'],
  ['2026-07-22', 'case-cz-os-ostrava-15t11-2025', 'Ostrava District Court, case 15 T 11/2025'],
  ['2026-07-23', 'case-cz-ms-praha-15a44-2026', 'Prague Municipal Court, case 15 A 44/2026 – Ministry of the Interior']
];
const courtProceedingsHtml = courtProceedings.map(([date, id, label]) => `<article id="${id}" class="chronology-reaction" data-court-start="${date}"><p><b>Start:</b> ${escapeHtml(formatDate(date))}</p><h3>${escapeHtml(label)}</h3><p><a href="zpravy/04082026-010.html#chronologie" hreflang="cs">Czech chronology and source context →</a></p></article>`).join('');
const currentEnglishDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Prague'
}).format(new Date()).toLocaleUpperCase('en-GB');
const html = `<!doctype html>
<html lang="en"><head><base href="../"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Godot online: complete English chronology of ${stateDocuments.length} source-linked Czech public records from 1 May 2026."><title>A time for the state to love — Godot online | CannaInsider.EU</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"><link rel="stylesheet" href="process-timers.css"><link rel="stylesheet" href="justice-slalom.css"><style>.english-chronology{display:grid;gap:1rem;padding-left:1.4rem}.english-chronology>li{padding:1rem;border:1px solid #c8d3d8;background:#fff}.english-chronology p{margin:.35rem 0}.chronology-reaction{margin-top:.8rem;padding:.8rem;border-left:4px solid #285b6f;background:#eef4f6}.chronology-reaction .kicker{color:#285b6f}.evidence-boundary{padding:1rem;border:1px solid #285b6f;background:#eef4f6}</style></head>
<body><header class="topline"><span>${currentEnglishDate}</span><span>INDEPENDENT EVIDENCE MEMORY · CZECHIA</span><a href="zpravy/04082026-010.html" lang="cs">ČESKY</a></header><header class="masthead"><a class="brand" href="en.html"><b>CannaInsider.EU</b><span>INTERNATIONAL EVIDENCE REPORTER</span></a><div class="brand-promise"><p>Will there be a cannabis amnesty?</p><img class="heart-logo" src="assets/votruba/heart-red-grayscale.png" alt="A red winged heart on a hand, Jiří Votruba"></div></header><nav class="nav"><a href="en.html">Front page</a><a href="news/index.html">News archive</a><a href="zpravy/04082026-010.html" hreflang="cs">Czech canonical edition</a></nav>
<main class="article-shell"><article><header class="article-header"><p class="kicker">GODOT ONLINE · COMPLETE ENGLISH CHRONOLOGY</p><h1>A time for the state to love — Godot online</h1><p class="standfirst">A complete English rendering of ${stateDocuments.length} source-linked records issued by Czech state bodies and public institutions from 1 May 2026.</p><div class="score score-red"><strong>${stateDocuments.length}/${stateDocuments.length}</strong><span>PUBLIC RECORDS TRANSLATED · CZECH SOURCES CONTROL</span></div><div class="news-meta"><span>From 1 May 2026</span><span>Author: Mgr. Dušan Dvořák</span></div></header><div class="article-body"><section class="evidence-boundary"><h2>Evidence boundary</h2><p>The Czech official records and linked Czech PDFs remain the controlling sources. This page translates the project’s factual descriptions; it does not replace the originals or provide legal advice.</p><p>A transfer, referral, acknowledgement, review or opening of a proceeding is reported as a procedural act. It is not presented as proof of wrongdoing or as a prediction of the final outcome.</p><p>For subsequent filings, <b>To</b> identifies the receiving authority, while <b>For</b> identifies a separately documented authority expected to decide or substantively handle the filing. “For” is omitted when no distinct authority is documented.</p></section><section><h2>Active court proceedings since 1 May 2026</h2><div class="live-docket-links">${courtProceedingsHtml}</div></section><h2 id="chronology">Proceedings from 1 May 2026 — when will Godot arrive?</h2>${hiddenOutgoingAnchors}${chronology}</div></article></main><footer><div class="brand"><b>CannaInsider.EU</b><span>INTERNATIONAL EVIDENCE REPORTER</span></div><p><b>Operator: Cannabis is The Cure, z. s.</b></p><p>Czech official records remain controlling. Human review is required before relying on a translation.</p></footer></body></html>`;

await writeFile(targetPath, html, 'utf8');
console.log(`English Godot: ${chronologyDocuments.length} authority responses; outgoing filings only in relation columns; newest on top, oldest=1.`);
