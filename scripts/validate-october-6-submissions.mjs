import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { approvedOct6PublicLabelsMatch, evaluatePinnedJusticeSlalomOriginal, indexJusticeSlalomHardeningEvidence, policyHardenedCopyOk } from './justice-slalom-pdf-provenance.mjs';

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
const hardeningReport = await readJson('project-memory/privacy-hardening-report.json');
const contract = await readJson('project-memory/private-redaction-policy-contract.json');
must(contract.status==='binding' && contract.policy_id==='evidence-lab-private-redaction-policy' &&
  contract.revision===1 && contract.revision_token==='2026-11-17-v1' &&
  contract.hmac_algorithm==='sha256' && /^[0-9a-f]{64}$/.test(String(contract.approved_policy_hmac||'')),
  'chybí závazná identita privátního redakčního kontraktu');
const scannerSha = sha(await readFile('scripts/publication_redaction.py'));
must(hardeningReport.schema_version==='1.2' &&
  hardeningReport.policy_file==='scripts/publication_redaction.py' &&
  hardeningReport.policy_sha256===scannerSha, 'privacy report neodpovídá autentizovanému skeneru');
const {hardeningById,hardeningReportOk}=indexJusticeSlalomHardeningEvidence(hardeningReport, {
  expectedAuthenticatedPolicyIdentity: contract.approved_policy_hmac,
});
must(hardeningReportOk, 'privacy report není autentizován nebo obsahuje chyby');

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
// Immutable supplements pin the uploaded ORIGINAL SHA; the trusted scanner may
// redact the public copy only with a clean exact-SHA authenticated report.
const originalInventories=new Map([...batch.documents,...ombBatch.documents].map(d=>[d.id,d]));
// Exact pinned publication annotations. Pattern-based checks cannot reject
// negated redaction ("not a redacted copy") or paraphrased original claims.
const OCT6_APPROVED_PUBLIC_LABELS = {
  "doc-cz-ekk-2026-10-06-cnb-rb-aml-podnet": {
    "cs": "Podání Edukativní konopné kliniky ze dne 6. 10. 2026 je výslovně adresováno České národní bance datovou schránkou a Ombudsmanovi Raiffeisenbank. Původní PDF dodané uživatelem je uchováno jako samostatný důkazní originál se zdrojovým SHA-256; veřejně zpřístupňované PDF je redigovanou kopií s odlišným SHA-256.",
    "en": "A filing dated 6 October 2026 by the Educational Cannabis Clinic to the Czech National Bank and the Raiffeisenbank Ombudsman. It challenges repeated AML/KYC questionnaire requests under Section 9 of Act No. 253/2008 in the context of a very low-turnover association account and encloses the bank’s same-day request warning that services may be restricted or the relationship terminated if the questionnaire is not provided by 13 October 2026. The public copy limits private contact information and the name of another natural person."
  },
  "doc-cz-dd-2026-10-06-ms-praha-18a17-18a23-dukazni-doplneni": {
    "cs": "Podání Městskému soudu v Praze ze dne 6. 10. 2026 je společným důkazním doplněním pro sp. zn. 18 A 17/2026 a 18 A 23/2026. Původní PDF dodané uživatelem je uchováno jako samostatný důkazní originál se zdrojovým SHA-256; veřejně zpřístupňované PDF je redigovanou kopií s odlišným SHA-256.",
    "en": "A joint urgent evidentiary supplement dated 6 October 2026 for Prague Municipal Court cases 18 A 17/2026 and 18 A 23/2026. It expressly does not alter the defendants, factual core or relief sought and presents subsequent evidence concerning disputed forensic practices in analysing THC content in seized cannabis, THCA-to-THC conversion during heating and the possible legislative overlay of earlier practice. The public copy omits the claimant’s date of birth and private home address."
  },
  "doc-cz-citc-2026-10-06-eu-ombudsman-euda-form-59936": {
    "cs": "Cannabis is The Cure, z. s. podalo dne 6. 10. 2026 v 11:39 CEST stížnost prostřednictvím oficiálního formuláře Evropského ombudsmana. Formulář eviduje EOWEB_COMPLAINT_ID 59936. Stížnost namítá možný nesprávný úřední postup EUDA při zajišťování, kontrole, interpretaci a zveřejňování evropských údajů o obsahu THC a žádá přezkum metodické auditní stopy, definice THC/THCA, vzorkování, homogenizace, sušení, skladování, analytických metod a nejistoty měření. Uživatelem dodaný originál je archivován s původním SHA-256. Veřejně zpřístupňovaný soubor je bezpečnostně redigovaná kopie s vlastním odlišným SHA-256.",
    "en": "Complaint filed on 6 October 2026 by Cannabis is The Cure, z. s. through the European Ombudsman’s official complaint form, EOWEB_COMPLAINT_ID 59936. The complaint concerns EUDA’s handling, methodological comparability and transparent interpretation of European THC data, including THC/THCA definitions, sampling, homogenisation, drying, storage, analytical methods and measurement uncertainty. The original supplied by the user is retained with its original SHA-256; the public PDF is a privacy-redacted derivative with a separate SHA-256."
  }
};
for (const id of [cnbId,msId,ombId]) {
  const expected=OCT6_APPROVED_PUBLIC_LABELS[id];
  must(expected && approvedOct6PublicLabelsMatch({
    actualCs: originalInventories.get(id)?.evidence_note,
    actualEn: translations.documents?.[id],
    approvedCs: expected.cs, approvedEn: expected.en,
  }),
    'změna schváleného popisku provenance/redakce veřejného PDF vyžaduje review: '+id);
}

const proofById=new Map();
for (const [id,pdf,expectedSha] of originals) {
  const d=canonicalById.get(id);
  const inventory=originalInventories.get(id);
  must(inventory?.public?.pdf===pdf && inventory.public.sha256===expectedSha &&
    inventory.public.source_original_sha256===expectedSha,
    'neměnný původní důkazní inventář nesedí: '+id);
  must(d.public?.pdf===pdf && d.public?.source_original_sha256===expectedSha &&
    d.public?.verification_status?.split(';').map(x=>x.trim()).includes('publication_policy_hardened'),
    'záznam redigované veřejné kopie není doložen: '+id);
  const bytes=await readFile('web/'+pdf);
  must(bytes.subarray(0,5).toString()==='%PDF-' &&
    bytes.subarray(-2048).toString('latin1').includes('%%EOF'),
    'neplatné PDF: '+id);
  const digest=sha(bytes);
  must(d.public.sha256===digest, 'veřejný SHA neodpovídá skutečnému PDF: '+id);
  const hardened=policyHardenedCopyOk({
    doc:d,digest,expectedInputSha:expectedSha,hardeningById,hardeningReportOk,
  });
  if(id===cnbId || id===msId) {
    const proof=evaluatePinnedJusticeSlalomOriginal({
      doc:d,digest,expectedSourceSha:expectedSha,hardeningById,hardeningReportOk,
    });
    must(proof.provenanceOk && proof.policyHardened && proof.effectiveKind==='redacted_public_copy',
      'Justiční slalom nemá autentizovanou redigovanou kopii: '+id);
    proofById.set(id, {digest,kind:proof.effectiveKind});
  } else {
    must(hardened && !d.justice_slalom,
      'ombudsman nemá autentizovanou redigovanou veřejnou kopii: '+id);
  }
}
const cnb=canonicalById.get(cnbId);
const ms=canonicalById.get(msId);
must(cnb.justice_slalom?.source_kind==='original_pdf_uploaded_by_user' &&
     cnb.justice_slalom?.source_sha256===originals[0][2], 'ČNB ztratila důkazní originál');
must(ms.justice_slalom?.source_kind==='original_pdf_uploaded_by_user' &&
     ms.justice_slalom?.source_sha256===originals[1][2], 'MS Praha ztratila důkazní originál');
must(cnb.justice_slalom.recipients.length===2 && ms.justice_slalom.recipients.length===1,
  'adresátské řádky 2+1 nejsou zachovány');

const todayRows=slalom.rows.filter(row=>row.date==='2026-10-06');
must(todayRows.filter(row=>row.document_id===cnbId).length===2, 'ČNB nemá dva řádky');
must(todayRows.filter(row=>row.document_id===msId).length===1, 'MS Praha nemá jeden řádek');
must(todayRows.filter(row=>[cnbId,msId].includes(row.document_id)).every(row=>{
  const proof=proofById.get(row.document_id);
  return row.pdf_kind===proof.kind && row.pdf_sha256===proof.digest &&
    row.pdf===canonicalById.get(row.document_id).public.pdf;
}), 'dnešní Slalom musí označovat přesné bezpečné veřejné kopie');

const caseMap=new Map(cases.cases.map(item=>[item.id,item]));
must(caseMap.get('case-cz-cnb-raiffeisenbank-aml-2026')?.last_filing_document_id===cnbId, 'ČNB case není napojen');
for (const cid of ['case-cz-ms-praha-18a17-2026','case-cz-ms-praha-18a23-2026']) {
  const item=caseMap.get(cid);
  must(String(item?.last_filing_on||'')>='2026-10-06' && item?.related_document_ids?.includes(msId), cid+' nezachovává podání 6. 10. v procesní genealogii');
}
const ombCase=caseMap.get('case-eu-omb-euda-thc-comparability-2026');
must(ombCase?.related_document_ids?.includes(ombId) && String(ombCase?.last_filing_on||'')>='2026-10-06', 'Ombudsman case nezachovává formulář 59936 v procesní genealogii');

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

console.log('OCT6 OK: originální SHA všech tří podání zachována; veřejná PDF kryptograficky svázána s autorizovaným privacy redakčním reportem; ČNB a MS Praha správně jako redigované veřejné kopie ve Slalomu.');
