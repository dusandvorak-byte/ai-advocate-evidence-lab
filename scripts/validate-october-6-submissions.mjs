import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const must = (condition, message) => { if (!condition) throw new Error('OCT6: ' + message); };

const batchPath = 'project-memory/documents-2026-supplement-2026-10-06-cnb-ms-praha.json';
const batch = await readJson(batchPath);
const sources = await readJson('project-memory/document-sources.json');
const institutions = await readJson('project-memory/institutions.json');
const translations = await readJson('project-memory/english-godot-translations.json');
const cases = await readJson('project-memory/cases.json');
const canonical = await readJson('project-memory/documents-2026.json');
const slalom = await readJson('web/data/justice-slalom.json');

const cnbId = 'doc-cz-ekk-2026-10-06-cnb-rb-aml-podnet';
const msId = 'doc-cz-dd-2026-10-06-ms-praha-18a17-18a23-dukazni-doplneni';
const docs = new Map(batch.documents.map(item => [item.id, item]));
const canonicalIds = new Set(canonical.documents.map(item => item.id));
must(batch.documents.length === 2 && docs.has(cnbId) && docs.has(msId), 'balík nemá přesně obě podání ze 6. 10. 2026');
must(sources.sources.some(item => item.path === batchPath), 'balík není v document-sources');
must(canonicalIds.has(cnbId) && canonicalIds.has(msId), 'obě podání nejsou v konsolidovaném registru');

const cnb = docs.get(cnbId);
const ms = docs.get(msId);
must(cnb.issue_date === '2026-10-06' && cnb.received_date === '2026-10-06', 'ČNB podání nemá doložené datum 6. 10. 2026');
must(ms.issue_date === '2026-10-06' && ms.received_date === null, 'MS Praha musí zachovat pouze doložené datum listiny, nikoli vymyšlené doručení');
must(cnb.justice_slalom.archive_number === 142 && ms.justice_slalom.archive_number === 143, 'archivní čísla musí navazovat 142–143');
must(cnb.justice_slalom.recipients.length === 2, 'ČNB podání musí mít dva adresátské řádky');
must(cnb.justice_slalom.recipients[0].institution_id === 'CZ-CNB', 'primárním adresátem ČNB podání musí být ČNB');
must(cnb.justice_slalom.recipients[1].institution_id === 'CZ-RB-OMB', 'druhým adresátem musí být Ombudsman Raiffeisenbank');
must(ms.justice_slalom.recipients.length === 1 && ms.justice_slalom.recipients[0].institution_id === 'CZ-MS-PHA', 'MS Praha podání musí mít jeden soudní adresátský řádek');
must(ms.case_ids.includes('case-cz-ms-praha-18a17-2026') && ms.case_ids.includes('case-cz-ms-praha-18a23-2026'), 'MS Praha podání musí být spojeno s oběma řízeními');

const sourceTextSpecs = [
  [cnb, 'project-memory/user-text-sources-2026-10-06/cnb-rb-2026-10-06.txt', ['Česká národní banka Datovou schránkou 6.10.2026', 'Ombudsman Raiffeisenbank a.s.', 'nejpozději však do 13.10.2026.']],
  [ms, 'project-memory/user-text-sources-2026-10-06/ms-praha-18a17-18a23-2026-10-06.txt', ['SPOLEČNÉ MIMOŘÁDNĚ NALÉHAVÉ DŮKAZNÍ DOPLNĚNÍ', '18 A 17/2026', '18 A 23/2026', 'sporných forenzních praxí při analýzách']]
];
for (const [doc, path, phrases] of sourceTextSpecs) {
  const text = await readFile(path, 'utf8');
  for (const phrase of phrases) must(text.includes(phrase), path + ' postrádá: ' + phrase);
  const textSha = sha(Buffer.from(text));
  must(doc.public.source_text_sha256 === textSha && doc.justice_slalom.source_text_sha256 === textSha, 'SHA textového zdroje nesedí pro ' + doc.id);
  const bytes = await readFile('web/' + doc.public.pdf);
  must(bytes.subarray(0, 5).toString() === '%PDF-', 'veřejná kopie není PDF: ' + doc.public.pdf);
  must(bytes.subarray(-2048).toString('latin1').includes('%%EOF'), 'veřejná kopie nemá %%EOF: ' + doc.public.pdf);
  const pdfSha = sha(bytes);
  must(doc.public.sha256 === pdfSha && doc.justice_slalom.public_sha256 === pdfSha, 'SHA veřejné kopie nesedí pro ' + doc.id);
  must(doc.justice_slalom.source_kind === 'redacted_public_copy_from_user_original', 'veřejná kopie nemá správnou provenienci: ' + doc.id);
  must(doc.justice_slalom.redaction_manifest === batchPath, 'chybí redakční manifest: ' + doc.id);
}
const cnbText = await readFile('project-memory/user-text-sources-2026-10-06/cnb-rb-2026-10-06.txt', 'utf8');
const msText = await readFile('project-memory/user-text-sources-2026-10-06/ms-praha-18a17-18a23-2026-10-06.txt', 'utf8');
must(!cnbText.includes('798 55 Ospělov 6') && !cnbText.includes('Eliška Svobodová'), 'veřejný ČNB text obsahuje odstraněné soukromé údaje');
must(!msText.includes('nar. 12. 1. 1962') && !msText.includes('Ospělov 6, 798 55'), 'veřejný MS Praha text obsahuje odstraněné soukromé údaje');

const instMap = new Map(institutions.institutions.map(item => [item.id, item]));
must(instMap.get('CZ-CNB')?.name === 'Česká národní banka', 'chybí instituce ČNB');
must(instMap.get('CZ-RB-OMB')?.name === 'Ombudsman Raiffeisenbank a.s.', 'chybí instituce Ombudsman Raiffeisenbank');
must(translations.institutions['CZ-CNB'] === 'Czech National Bank', 'chybí anglický název ČNB');
must(translations.institutions['CZ-RB-OMB'] === 'Raiffeisenbank Ombudsman', 'chybí anglický název bankovního ombudsmana');
must(Boolean(translations.documents[cnbId]) && Boolean(translations.documents[msId]), 'chybí anglické anotace obou listin');

const caseMap = new Map(cases.cases.map(item => [item.id, item]));
must(caseMap.get('case-cz-cnb-raiffeisenbank-aml-2026')?.last_filing_document_id === cnbId, 'ČNB větev není napojena na dnešní podání');
for (const cid of ['case-cz-ms-praha-18a17-2026','case-cz-ms-praha-18a23-2026']) {
  const item = caseMap.get(cid);
  must(item?.last_filing_on === '2026-10-06' && item?.last_filing_document_id === msId, cid + ' nemá dnešní poslední podání');
  must(item.related_document_ids?.includes(msId), cid + ' nemá obousměrnou vazbu na dnešní podání');
}

const todayRows = slalom.rows.filter(row => row.date === '2026-10-06');
must(todayRows.length === 3, 'Justiční slalom nemá tři adresátské řádky ze 6. 10. 2026');
must(todayRows.filter(row => row.document_id === cnbId).length === 2, 'ČNB listina nemá dva řádky');
must(todayRows.filter(row => row.document_id === msId).length === 1, 'MS Praha listina nemá jeden řádek');
must(todayRows.every(row => row.pdf_kind === 'redacted_public_copy'), 'dnešní PDF nesmějí být označena jako originály');
must(todayRows.every(row => row.pdf && row.pdf_sha256), 'dnešní řádky nemají PDF a SHA');

const pages = [
  ['web/index.html', cnbId, msId],
  ['web/en.html', cnbId, msId],
  ['web/kc/index.html', cnbId, msId],
  ['web/kc/en.html', cnbId, msId],
  ['web/zpravy/04082026-010.html', cnbId, msId],
  ['web/news/04082026-010.html', cnbId, msId]
];
for (const [path, ...ids] of pages) {
  const html = await readFile(path, 'utf8');
  for (const id of ids) must(html.includes(id), path + ' neobsahuje ' + id);
}

const godotCs = await readFile('web/zpravy/04082026-010.html', 'utf8');
const godotEn = await readFile('web/news/04082026-010.html', 'utf8');
must(godotCs.includes('doc-eu-omb-2026-09-28-complaint-form-required'), 'Stát lásky čas ztratil odpověď Evropského ombudsmana');
must(godotEn.includes('en-doc-eu-omb-2026-09-28-complaint-form-required'), 'anglická plocha ztratila odpověď Evropského ombudsmana');
must(!slalom.rows.some(row => row.document_id === 'doc-eu-omb-2026-09-28-complaint-form-required'), 'odpověď Evropského ombudsmana nesmí být v Justičním slalomu');

console.log('OCT6 OK: 2 filings, 3 Slalom recipient rows, both PDF public copies verified, case and CZ/EN parity preserved, EU Ombudsman response remains in Stát lásky čas.');
