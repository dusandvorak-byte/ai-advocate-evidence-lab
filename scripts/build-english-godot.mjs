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
  .replace(/^proti /i, 'against ')
  .replace(/^stížnost podle § 16a InfZ – žádosti /i, 'complaint under Section 16a of the Freedom of Information Act – requests ');
const compareDocuments = (a, b) => String(a.issue_date).localeCompare(String(b.issue_date)) || String(a.id).localeCompare(String(b.id));

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
  .filter(item => item.issue_date >= mainFrom && (item.submission_side === 'incoming_from_state_or_public_institution' || item.document_type === 'state_record'))
  .sort(compareDocuments);
const outgoingDocuments = documents.filter(item => item.issue_date >= mainFrom && item.submission_side === 'outgoing_from_user_or_alliance');
if (stateDocuments.length !== 67) throw new Error(`English Godot requires 67 state/public records; found ${stateDocuments.length}`);

const usedInstitutionIds = new Set([...stateDocuments, ...outgoingDocuments].map(item => item.institution_id));
for (const id of usedInstitutionIds) if (!translations.institutions?.[id]) throw new Error(`Missing English institution name: ${id}`);
for (const item of [...stateDocuments, ...outgoingDocuments]) if (!translations.documents?.[item.id]) throw new Error(`Missing English document description: ${item.id}`);

const routeTranslations = new Map([
  ['Policejní prezidium České republiky', 'Police Presidium of the Czech Republic'],
  ['Odbor vnitřní kontroly Policejního prezidia České republiky', 'Internal Control Office of the Police Presidium'],
  ['Okresní soud v Prostějově', 'Prostějov District Court'],
  ['Krajský soud v Brně', 'Brno Regional Court'],
  ['Ministerstvo spravedlnosti', 'Ministry of Justice'],
  ['ministr spravedlnosti', 'Minister of Justice'],
  ['Ministerstvo vnitra', 'Ministry of the Interior'],
  ['ministr vnitra', 'Minister of the Interior'],
  ['Nejvyšší státní zastupitelství', 'Supreme Public Prosecutor’s Office'],
  ['Úřad pro ochranu osobních údajů', 'Office for Personal Data Protection'],
  ['Městské státní zastupitelství v Praze', 'Prague Municipal Public Prosecutor’s Office'],
  ['Vrchní státní zastupitelství v Praze', 'Prague High Public Prosecutor’s Office']
]);
const translateRoute = value => routeTranslations.get(value) || value;
const timersByDocument = new Map(timers.timers.filter(item => item.source_document_id).map(item => [item.source_document_id, item]));

const reactionsByTarget = new Map();
const attachmentsByTarget = new Map();
for (const item of outgoingDocuments) {
  for (const relation of item.relations || []) {
    const type = relation.type || relation.relation_type;
    const targetId = relation.target_id || relation.document_id;
    if (!targetId) continue;
    const map = type === 'reakce_na' ? reactionsByTarget : type === 'priloha_k' ? attachmentsByTarget : null;
    if (!map) continue;
    const bucket = map.get(targetId) || [];
    bucket.push(item);
    map.set(targetId, bucket);
  }
}

const sourceLink = item => {
  const published = item.public || {};
  if (published.pdf) return `<a href="${escapeHtml(publicPath(published.pdf))}" target="_blank" rel="noopener">Original Czech PDF</a>`;
  if (published.html) return `<a href="${escapeHtml(publicPath(published.html))}">Czech evidence record</a>`;
  return `<a href="listiny/${escapeHtml(item.id)}.html">Czech evidence record</a>`;
};

const reactionCard = (item, label = 'Subsequent filing') => {
  const timer = timersByDocument.get(item.id);
  const relation = (item.relations || []).find(rel => (rel.type || rel.relation_type) === 'reakce_na');
  const targetDocument = relation ? documentsById.get(relation.target_id || relation.document_id) : null;
  const to = timer?.recipient
    ? translateRoute(timer.recipient)
    : item.recipient_en
      ? item.recipient_en
    : targetDocument
      ? translations.institutions[targetDocument.institution_id]
      : null;
  const forAuthority = timer?.for_authority ? translateRoute(timer.for_authority) : null;
  const from = timer?.actor ? translateRoute(timer.actor) : translations.institutions[item.institution_id];
  return `<aside id="en-${escapeHtml(item.id)}" class="chronology-reaction" data-outgoing-id="${escapeHtml(item.id)}"><p class="kicker">${escapeHtml(label)}</p><p><b>Date:</b> ${escapeHtml(formatDate(item.issue_date))}</p>${to ? `<p><b>To:</b> ${escapeHtml(to)}</p>` : ''}${forAuthority ? `<p><b>For:</b> ${escapeHtml(forAuthority)}</p>` : ''}<p><b>Reference:</b> ${escapeHtml(englishReferenceText(item))}</p><p><b>From:</b> ${escapeHtml(from)}</p><p><b>What happened:</b> ${escapeHtml(translations.documents[item.id])}</p><p>${sourceLink(item)}</p></aside>`;
};

const chronologyItem = item => {
  const reactions = (reactionsByTarget.get(item.id) || []).sort(compareDocuments);
  const reactionHtml = reactions.map(reaction => {
    const attachments = (attachmentsByTarget.get(reaction.id) || []).sort(compareDocuments).map(attachment => reactionCard(attachment, 'Evidentiary annex')).join('');
    return `${reactionCard(reaction)}${attachments}`;
  }).join('');
  return `<li id="en-${escapeHtml(item.id)}" data-document-id="${escapeHtml(item.id)}" data-issue-date="${escapeHtml(item.issue_date)}"><p><b>Date:</b> ${escapeHtml(formatDate(item.issue_date))}</p><p><b>From:</b> ${escapeHtml(translations.institutions[item.institution_id])}</p><p><b>Reference:</b> ${escapeHtml(englishReferenceText(item))}</p><p><b>What happened:</b> ${escapeHtml(translations.documents[item.id])}</p><p>${sourceLink(item)} · <a href="zpravy/04082026-010.html#${escapeHtml(item.id)}" hreflang="cs">Czech chronology entry</a></p>${reactionHtml}</li>`;
};

const chronology = stateDocuments.map(chronologyItem).join('');
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
const linkedOutgoingIds = new Set([...reactionsByTarget.values(), ...attachmentsByTarget.values()].flat().map(item => item.id));
const unlinkedOutgoing = outgoingDocuments.filter(item => !linkedOutgoingIds.has(item.id)).sort(compareDocuments);
const unlinkedSection = unlinkedOutgoing.length
  ? `<section><h2>Additional tracked filings without an explicit reaction link</h2><p>These filings are translated and retained separately because the canonical registry does not identify a specific state record to which they should be attached.</p>${unlinkedOutgoing.map(item => reactionCard(item, 'Separately tracked filing')).join('')}</section>`
  : '';
const html = `<!doctype html>
<html lang="en"><head><base href="../"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Godot online: complete English chronology of 67 source-linked Czech public records from 1 May 2026."><title>A time for the state to love — Godot online | CannaInsider.EU</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"><link rel="stylesheet" href="process-timers.css"><style>.english-chronology{display:grid;gap:1rem;padding-left:1.4rem}.english-chronology>li{padding:1rem;border:1px solid #c8d3d8;background:#fff}.english-chronology p{margin:.35rem 0}.chronology-reaction{margin-top:.8rem;padding:.8rem;border-left:4px solid #285b6f;background:#eef4f6}.chronology-reaction .kicker{color:#285b6f}.evidence-boundary{padding:1rem;border:1px solid #285b6f;background:#eef4f6}</style></head>
<body><header class="topline"><span>${currentEnglishDate}</span><span>INDEPENDENT EVIDENCE MEMORY · CZECHIA</span><a href="zpravy/04082026-010.html" lang="cs">ČESKY</a></header><header class="masthead"><a class="brand" href="en.html"><b>CannaInsider.EU</b><span>INTERNATIONAL EVIDENCE REPORTER</span></a><div class="brand-promise"><p>Will there be a cannabis amnesty?</p><img class="heart-logo" src="assets/votruba/heart-red-grayscale.png" alt="A red winged heart on a hand, Jiří Votruba"></div></header><nav class="nav"><a href="en.html">Front page</a><a href="news/index.html">News archive</a><a href="zpravy/04082026-010.html" hreflang="cs">Czech canonical edition</a></nav>
<main class="article-shell"><article><header class="article-header"><p class="kicker">GODOT ONLINE · COMPLETE ENGLISH CHRONOLOGY</p><h1>A time for the state to love — Godot online</h1><p class="standfirst">A complete English rendering of 67 source-linked records issued by Czech state bodies and public institutions from 1 May 2026.</p><div class="score score-red"><strong>67/67</strong><span>PUBLIC RECORDS TRANSLATED · CZECH SOURCES CONTROL</span></div><div class="news-meta"><span>From 1 May 2026</span><span>Author: Mgr. Dušan Dvořák</span></div></header><div class="article-body"><section class="evidence-boundary"><h2>Evidence boundary</h2><p>The Czech official records and linked Czech PDFs remain the controlling sources. This page translates the project’s factual descriptions; it does not replace the originals or provide legal advice.</p><p>A transfer, referral, acknowledgement, review or opening of a proceeding is reported as a procedural act. It is not presented as proof of wrongdoing or as a prediction of the final outcome.</p><p>For subsequent filings, <b>To</b> identifies the receiving authority, while <b>For</b> identifies a separately documented authority expected to decide or substantively handle the filing. “For” is omitted when no distinct authority is documented.</p></section><section><h2>Active court proceedings since 1 May 2026</h2><div class="live-docket-links">${courtProceedingsHtml}</div></section><h2 id="chronology">Proceedings from 1 May 2026 — when will Godot arrive?</h2><ol class="english-chronology" data-english-chronology-count="${stateDocuments.length}">${chronology}</ol>${unlinkedSection}</div></article></main><footer><div class="brand"><b>CannaInsider.EU</b><span>INTERNATIONAL EVIDENCE REPORTER</span></div><p><b>Operator: Cannabis is The Cure, z. s.</b></p><p>Czech official records remain controlling. Human review is required before relying on a translation.</p></footer></body></html>`;

await writeFile(targetPath, html, 'utf8');
console.log(`English Godot: ${stateDocuments.length}/67 public records and ${outgoingDocuments.length}/20 translated outgoing filings (${unlinkedOutgoing.length} separately tracked).`);
