import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const must = (condition, message) => { if (!condition) throw new Error('OCT6: ' + message); };

const batchPath = 'project-memory/documents-2026-supplement-2026-10-06-cnb-ms-praha.json';
const ombPath = 'project-memory/documents-2026-supplement-2026-10-06-eu-ombudsman-complaint.json';
const batch = await readJson(batchPath);
const ombBatch = await readJson(ombPath);
const sources = await readJson('project-memory/document-sources.json');
const translations = await readJson('project-memory/english-godot-translations.json');
const cases = await readJson('project-memory/cases.json');
const canonical = await readJson('project-memory/documents-2026.json');
const slalom = await readJson('web/data/justice-slalom.json');

const cnbId = 'doc-cz-ekk-2026-10-06-cnb-rb-aml-podnet';
const msId = 'doc-cz-dd-2026-10-06-ms-praha-18a17-18a23-dukazni-doplneni';
const ombId = 'doc-cz-citc-2026-10-06-eu-ombudsman-euda-form-59936';

must(sources.sources.some(item => item.path === batchPath), 'chybí zdroj obou podání do Slalomu');
must(sources.sources.some(item => item.path === ombPath), 'chybí zdroj stížnosti Evropskému ombudsmanovi');

const canonicalById = new Map(canonical.documents.map(item => [item.id,item]));
for (const id of [cnbId,msId,ombId]) must(canonicalById.has(id), 'kanonický registr postrádá ' + id);

const originals = [
  [cnbId,'documents/justice-slalom/2026-10/097-podani-2026-10-06-cnb-raiffeisenbank.pdf','a5e5890356ca4f7d520bdda7cbdbff1ffee92f9da9fffa37c9556f991e8252d4'],
  [msId,'documents/justice-slalom/2026-10/098-podani-2026-10-06-ms-praha-18a17-18a23.pdf','6fac4edb59d7e5f67519ec853d810f9fc4a41e5946698ba54b1e7777d173082e'],
  [ombId,'documents/report-04082026-010/112-complaint-european-ombudsman-euda-2026-10-06.pdf','34254d11c01f91e8a12cb99800e8d16ca9ec715a6703d765401ddcd79595e434']
];
for (const [id,pdf,expectedSha] of originals) {
  const d=canonicalById.get(id);
  must(d.public?.pdf===pdf && d.public?.sha256===expectedSha, 'metadata originálu nesedí: '+id);
  const bytes=await readFile('web/'+pdf);
  must(bytes.subarray(0,5).toString()==='%PDF-' && bytes.subarray(-2048).toString('latin1').includes('%%EOF'), 'neplatné PDF: '+id);
  must(sha(bytes)===expectedSha, 'byte-identický SHA nesedí: '+id);
}

const cnb=canonicalById.get(cnbId);
const ms=canonicalById.get(msId);
must(cnb.justice_slalom?.source_kind==='original_pdf_uploaded_by_user' && cnb.justice_slalom?.source_sha256===cnb.public.sha256, 'ČNB není originál');
must(ms.justice_slalom?.source_kind==='original_pdf_uploaded_by_user' && ms.justice_slalom?.source_sha256===ms.public.sha256, 'MS Praha není originál');
must(cnb.justice_slalom.recipients.length===2 && ms.justice_slalom.recipients.length===1, 'adresátské řádky 2+1 nejsou zachovány');

const todayRows=slalom.rows.filter(row=>row.date==='2026-10-06');
must(todayRows.filter(row=>row.document_id===cnbId).length===2, 'ČNB nemá dva řádky');
must(todayRows.filter(row=>row.document_id===msId).length===1, 'MS Praha nemá jeden řádek');
must(todayRows.filter(row=>[cnbId,msId].includes(row.document_id)).every(row=>row.pdf_kind==='original'), 'dnešní Slalom musí odkazovat na originály');

const caseMap=new Map(cases.cases.map(item=>[item.id,item]));
must(caseMap.get('case-cz-cnb-raiffeisenbank-aml-2026')?.last_filing_document_id===cnbId, 'ČNB case není napojen');
for (const cid of ['case-cz-ms-praha-18a17-2026','case-cz-ms-praha-18a23-2026']) {
  const item=caseMap.get(cid);
  must(String(item?.last_filing_on||'')>='2026-10-06' && item?.related_document_ids?.includes(msId), cid+' nezachovává podání 6. 10. v procesní genealogii');
}
const ombCase=caseMap.get('case-eu-omb-euda-thc-comparability-2026');
must(ombCase?.last_filing_document_id===ombId && ombCase?.last_filing_on==='2026-10-06', 'Ombudsman case není posunut na formulář 59936');

must(Boolean(translations.documents[cnbId]) && Boolean(translations.documents[msId]) && Boolean(translations.documents[ombId]), 'chybí CZ/EN parita anotací');

const godotCs=await readFile('web/zpravy/04082026-010.html','utf8');
const godotEn=await readFile('web/news/04082026-010.html','utf8');
const ombResponseId='doc-eu-omb-2026-09-28-complaint-form-required';

const csStart=godotCs.indexOf('<table id="chronologie-seznam"');
const csEnd=csStart<0?-1:godotCs.indexOf('</table>',csStart);
const enStart=godotEn.indexOf('<table id="en-chronology-list"');
const enEnd=enStart<0?-1:godotEn.indexOf('</table>',enStart);
must(csStart>=0&&csEnd>=0&&enStart>=0&&enEnd>=0,'Státu lásky čas není uzavřená CZ/EN tabulka');
const csTable=godotCs.slice(csStart,csEnd+8);
const enTable=godotEn.slice(enStart,enEnd+8);

for (const id of [cnbId,msId,ombId]) {
  must(!csTable.includes(`<tr id="${id}"`), 'vlastní podání nesmí být hlavní řádek Státu lásky čas: '+id);
  must(!enTable.includes(`<tr id="en-${id}"`), 'EN: vlastní podání nesmí být hlavní řádek Státu lásky čas: '+id);
}
must(csTable.includes(`<tr id="${ombResponseId}"`), 'odpověď Evropského ombudsmana chybí jako hlavní řádek');
must(enTable.includes(`<tr id="en-${ombResponseId}"`), 'EN odpověď Evropského ombudsmana chybí jako hlavní řádek');
const ombCsStart=csTable.indexOf(`<tr id="${ombResponseId}"`);
const ombCsEnd=csTable.indexOf('</tr>',ombCsStart);
const ombCsRow=csTable.slice(ombCsStart,ombCsEnd+5);
must(ombCsRow.includes(`data-related-document-id="${ombId}"`), 'stížnost 59936 musí být uvedena jako námitka/opravný prostředek u odpovědi Ombudsmana');
must(ombCsRow.includes('112-complaint-european-ombudsman-euda-2026-10-06.pdf'), 'u stížnosti 59936 chybí aktivní originální PDF');
must(godotCs.includes('justice-slalom-shell state-love-shell')&&godotCs.includes('home-rollup justice-slalom state-love-panel'),'CZ Státu lásky čas nemá vizuál Justičního slalomu');
must(godotEn.includes('justice-slalom-shell state-love-shell')&&godotEn.includes('home-rollup justice-slalom state-love-panel'),'EN Státu lásky čas nemá vizuál Justičního slalomu');
must(!godotCs.includes('chronology-case-index')&&!godotCs.includes('lhuty-a-necinnost')&&!godotCs.includes('Anonymizační axiom:')&&!godotCs.includes('Důkazní hranice:'),'za tabulkou zůstaly odstraněné pomocné bloky');
must(!slalom.rows.some(row=>row.document_id===ombId),'stížnost Evropskému ombudsmanovi patří jako vztah k odpovědi ve Státu lásky čas, ne do Justičního slalomu');

console.log('OCT6 OK: ČNB + MS Praha jsou originály ve Slalomu; ve Státu lásky čas jsou pouze reakce orgánů a stížnost 59936 je vztahově uvedena u odpovědi Evropského ombudsmana.');
