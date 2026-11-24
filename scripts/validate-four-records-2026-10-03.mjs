import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evaluatePinnedJusticeSlalomOriginal, indexJusticeSlalomHardeningEvidence } from './justice-slalom-pdf-provenance.mjs';

const fail = message => { throw new Error(`FOUR-RECORDS-2026-10-03-GATE: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const supplementPath='project-memory/documents-2026-supplement-2026-10-03-four-records.json';
const supplement=JSON.parse(await readFile(supplementPath,'utf8'));
const canonicalRegistry=JSON.parse(await readFile('project-memory/documents-2026.json','utf8'));
const canonical={ docs:new Map((canonicalRegistry.documents||[]).map(d=>[d.id,d])) };
const docs=new Map((supplement.documents||[]).map(d=>[d.id,d]));
const ids=[
  'doc-cz-ks-brn-2026-09-03-9-to-315-2026-140',
  'doc-cz-ekk-2026-10-02-os-praha10-ftv-prima-doplneni-zaloby',
  'doc-cz-ms-pha-2026-10-02-18-a-17-2026-191',
  'doc-cz-dd-2026-10-04-ncoz-ms-pha-18-a-17-reakce',
];
for(const id of ids) if(!docs.has(id)) fail('chybí kanonická listina '+id);
const ks=docs.get(ids[0]), prima=docs.get(ids[1]), ms=docs.get(ids[2]), reaction=docs.get(ids[3]);

if(ks.reference!=='9 To 315/2026-140' || ks.issue_date!=='2026-09-03') fail('KS Brno: nesprávné datum nebo č. j.');
if(!ks.relations?.some(r=>r.type==='reakce_na'&&r.target_id==='doc-cz-dd-2026-08-11-stiznost-15-nt-3103-2026-53')) fail('KS Brno: chybí vazba na stížnost z 11. 8.');
if(prima.issue_date!=='2026-10-02' || prima.received_date!=='2026-10-02') fail('FTV Prima: chybné datum podání/doručení datovou schránkou');
if(!prima.relations?.some(r=>r.type==='reakce_na'&&r.target_id==='doc-cz-vs-pha-2026-09-14-3-cmo-24-2026-26')) fail('FTV Prima: chybí vazba na usnesení Vrchního soudu');
if(ms.reference!=='18 A 17/2026-191' || ms.issue_date!=='2026-10-02') fail('18 A 17/2026-191: nesprávné datum nebo č. j.');
if(reaction.issue_date!=='2026-10-04' || reaction.received_date!==null) fail('Reakce 4. 10.: datum listiny musí být zachováno, doručení se nesmí předjímat');
if(!reaction.relations?.some(r=>r.type==='reakce_na'&&r.target_id===ms.id)) fail('Reakce 4. 10.: chybí vazba na přípis soudu');

if(prima.justice_slalom?.archive_number!==137) fail('FTV Prima musí po vyřazení EKK mít interní archivní číslo 137');
if(reaction.justice_slalom?.archive_number!==138) fail('Reakce 4. 10. musí po vyřazení EKK mít interní archivní číslo 138');
if(!prima.justice_slalom?.recipients?.some(r=>r.institution_id==='CZ-OS-PHA10')) fail('FTV Prima: chybí OS Praha 10 jako adresát');
if(!reaction.justice_slalom?.recipients?.some(r=>r.institution_id==='CZ-NCOZ'&&r.role==='primary')) fail('Reakce 4. 10.: chybí NCOZ jako hlavní adresát');
if(!reaction.justice_slalom?.recipients?.some(r=>r.institution_id==='CZ-MS-PHA'&&r.role==='copy')) fail('Reakce 4. 10.: chybí MS Praha na vědomí');

const originals={
  [ks.id]:'e565b7e3bb122f00ff04720f1acce031525c1b9c2a2457a87cdac96055ec64a6',
  [prima.id]:'483f849dbe816df2bfaac7b8d7a5b7be2dc2a796b711c7aec9c880fc34f6a457',
  [ms.id]:'394d9db7e01099561138c77382e162b59810a4fdb77f1114b471fdc2e336f293',
  [reaction.id]:'3dd1854522b5bcb9d0f87f9d14f199881915e80bc91a9850a04ac404f33981a2',
};
for(const item of [ks,ms]){
  if(item.public?.source_original_sha256!==originals[item.id]) fail(item.id+': nesouhlasí SHA-256 nahraného originálu');
  if(!String(item.public.verification_status||'').includes('not_byte_identical_original')) fail(item.id+': veřejná kopie není jasně odlišena od originálu');
  const bytes=await readFile('web/'+item.public.pdf);
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF') || bytes.length<4000) fail(item.id+': veřejná kopie je neúplná');
  // The source supplement SHA describes the pre-redaction generated derivative.
  // Authenticate exact final public bytes against the post-hardening canonical registry.
  const final = canonical.docs.get(item.id);
  if(!final || final.public?.pdf !== item.public.pdf ||
     !/^[a-f0-9]{64}$/i.test(String(final.public?.sha256 || '')) ||
     !String(final.public?.verification_status || '').includes('verified_deterministic_public_text_copy') ||
     !String(final.public?.verification_status || '').includes('publication_policy_hardened') ||
     sha256(bytes) !== final.public.sha256) fail(item.id+': finální zredigovaná veřejná kopie nemá ověřenou provenienci/hash');
}
// This supplement is an immutable ORIGINAL inventory. Privacy hardening may
// produce a DIFFERENT public SHA, but only when the authenticated report binds
// the exact original to the clean derivative. Never change expected source SHAs.
const privacyReport=JSON.parse(await readFile('project-memory/privacy-hardening-report.json','utf8'));
const privateContract=JSON.parse(await readFile('project-memory/private-redaction-policy-contract.json','utf8'));
const bindingIdentity=privateContract.approved_policy_hmac;
if(privateContract.status!=='binding' ||
   privateContract.policy_id!=='evidence-lab-private-redaction-policy' ||
   privateContract.revision!==1 ||
   privateContract.revision_token!=='2026-11-17-v1' ||
   privateContract.hmac_algorithm!=='sha256' ||
   !/^[0-9a-f]{64}$/.test(String(bindingIdentity||'')))
  fail('chybí platný závazný kontrakt autentizované privátní politiky');
const publicRedactionScript=await readFile('scripts/publication_redaction.py');
if(privacyReport.schema_version!=='1.2' ||
   privacyReport.policy_file!=='scripts/publication_redaction.py' ||
   privacyReport.policy_sha256!==sha256(publicRedactionScript))
  fail('privacy report nemá správnou identitu veřejného skeneru');
const {hardeningById,hardeningReportOk}=indexJusticeSlalomHardeningEvidence(
  privacyReport, {expectedAuthenticatedPolicyIdentity:bindingIdentity},
);
if(!hardeningReportOk) fail('privacy report není kryptograficky svázán s autentizovanou privátní politikou nebo obsahuje chyby');
for(const item of [prima,reaction]){
  const originalSha=originals[item.id];
  if(item.public.sha256!==originalSha || item.public.source_original_sha256!==originalSha ||
     item.justice_slalom?.source_kind!=='original_pdf_uploaded_by_user' ||
     item.justice_slalom?.source_sha256!==originalSha ||
     !String(item.public.verification_status||'').includes('source_pdf_received_binary_original'))
    fail(item.id+': důkazní originál není v původní inventuře kryptograficky doložen');
  const final=canonical.docs.get(item.id);
  if(!final || final.public?.pdf!==item.public.pdf || final.justice_slalom?.source_sha256!==originalSha)
    fail(item.id+': kanonický veřejný záznam ztratil vazbu na doložený originál');
  const bytes=await readFile('web/'+item.public.pdf);
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF'))
    fail(item.id+': veřejné PDF je neúplné');
  const digest=sha256(bytes);
  const proof=evaluatePinnedJusticeSlalomOriginal({
    doc:final, digest, expectedSourceSha:originalSha, hardeningById, hardeningReportOk,
  });
  if(!proof.provenanceOk) fail(item.id+': chybí autentizované provázání originálu, veřejného SHA a privacy reportu');
  if(digest===originalSha && proof.effectiveKind!=='original')
    fail(item.id+': byte-identický originál má nesprávný veřejný typ');
  if(digest!==originalSha && (!proof.policyHardened || proof.effectiveKind!=='redacted_public_copy'))
    fail(item.id+': změněná veřejná kopie nebyla výslovně autorizována authenticated privacy scanem');
}

const institutions=JSON.parse(await readFile('project-memory/institutions.json','utf8'));
if(!institutions.institutions?.some(i=>i.id==='CZ-OS-PHA10'&&i.name==='Obvodní soud pro Prahu 10')) fail('chybí OS Praha 10 v registru institucí');

const cases=JSON.parse(await readFile('project-memory/cases.json','utf8'));
const a17=cases.cases?.find(c=>c.id==='case-cz-ms-praha-18a17-2026');
// Historical validator: the 4 Oct filing must remain linked, but newer filings may legitimately become last_filing.
if(!a17?.related_document_ids?.includes(ms.id) || !a17?.related_document_ids?.includes(reaction.id) || !a17?.last_filing_document_id || String(a17?.last_filing_on||'')<'2026-10-04') fail('18 A 17/2026 ztratilo historický přípis 2. 10. nebo reakci 4. 10.');
if(a17.latest_state_document_id!=='doc-cz-ms-pha-2026-10-12-18-a-17-2026-215') fail('18 A 17/2026: ztraceno soudní rozhodnutí 12. 10.');
if(a17.cassation_status!=='dated_2026-10-30_original_uploaded_filing_unverified' || a17.latest_prepared_pleading_document_id!=='doc-cz-dd-2026-10-30-kasacni-ncoz-pp-18a17') fail('18 A 17/2026: nová listina 30. 10. musí být evidována jako kasační stížnost bez nedoloženého doručení NSS');
const c315=cases.cases?.find(c=>c.id==='case-cz-ks-brno-9to315-2026');
if(c315?.decision_document_id!==ks.id || c315?.status!=='complaint_dismissed_no_ordinary_remedy') fail('9 To 315/2026 nemá rozhodnutí v grafu řízení');

const timers=JSON.parse(await readFile('project-memory/process-timers.json','utf8'));
const timer=timers.timers?.find(t=>t.id==='timer-court-18a17-2026');
if(timer?.status!=='active_response_period_before_decision') fail('18 A 17 interní procesní větev nereflektuje přípis 2. 10.');
if('due_date' in timer && timer.due_date) fail('18 A 17 nesmí mít odvozené datum konce desetidenní lhůty bez doloženého data doručení');

const tr=JSON.parse(await readFile('project-memory/english-godot-translations.json','utf8'));
for(const id of ids) if(!tr.documents?.[id]) fail('chybí EN překlad '+id);

const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');
for(const item of [ks,ms]){
  if(!cz.includes(`id="${item.id}"`)) fail('CZ Godot neobsahuje státní listinu '+item.id);
  if(!en.includes(`id="en-${item.id}"`)) fail('EN Godot neobsahuje státní listinu '+item.id);
  const href=item.public.pdf;
  if(!cz.includes(href) || !en.includes(href)) fail('CZ/EN Godot nemá přímý PDF odkaz státní listiny '+item.id);
}
for(const item of [prima,reaction]){
  if(cz.includes(`<tr id="${item.id}"`) || en.includes(`<tr id="en-${item.id}"`)) fail('naše podání se nesmí vrátit jako hlavní řádek Státu lásky čas: '+item.id);
}
const msStart=cz.indexOf(`<tr id="${ms.id}"`);
const msEnd=msStart<0?-1:cz.indexOf('</tr>',msStart);
const msRow=msStart>=0&&msEnd>=0?cz.slice(msStart,msEnd+5):'';
if(!msRow.includes(`data-related-document-id="${reaction.id}"`) || !msRow.includes(reaction.public.pdf)) fail('reakce 4. 10. není uvedena jako námitka/opravný prostředek u přípisu MS Praha');
if(!cz.includes('9 To 315/2026-140') || !cz.includes('18 A 17/2026-191')) fail('CZ Godot neobsahuje klíčové reference');

const slalom=JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));
for(const item of [prima,reaction]){
  const final=canonical.docs.get(item.id);
  const digest=sha256(await readFile('web/'+item.public.pdf));
  const proof=evaluatePinnedJusticeSlalomOriginal({
    doc:final, digest, expectedSourceSha:originals[item.id], hardeningById, hardeningReportOk,
  });
  const rows=slalom.rows?.filter(r=>r.document_id===item.id)||[];
  if(!rows.length || rows.some(r=>r.pdf_kind!==proof.effectiveKind ||
     r.pdf!==item.public.pdf || r.pdf_sha256!==digest))
    fail(item.id+': Justiční slalom má chybný typ veřejné kopie, odkaz nebo SHA');
}
console.log('Čtyři listiny: státní veřejné kopie zachovány; FTV Prima a reakce 4. 10. kryptograficky vážou nahrané originály na případné autentizované redigované veřejné kopie; CZ/EN a Justiční slalom OK.');
