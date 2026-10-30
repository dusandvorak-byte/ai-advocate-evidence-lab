import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const fail=m=>{throw Error('PRAGUE-A17-A23-ORIGINALS: '+m)};
const must=(v,m)=>{if(!v)fail(m)};
const name='project-memory/documents-2026-supplement-2026-10-20-ms-praha-two-dismissals.json';
const batch=JSON.parse(await readFile(name,'utf8'));
const manifest=JSON.parse(await readFile('project-memory/document-sources.json','utf8'));
const cases=JSON.parse(await readFile('project-memory/cases.json','utf8'));
const courts=JSON.parse(await readFile('project-memory/active-court-dockets.json','utf8'));
const t=JSON.parse(await readFile('project-memory/english-godot-translations.json','utf8'));
const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');
must(manifest.sources.some(x=>x.path===name),'batch not registered in canonical source list');
must(batch.documents.length===2,'must publish only the two user-specified new Prague decisions');
const specs=[
 {id:'doc-cz-ms-pha-2026-10-12-18-a-17-2026-215',case:'case-cz-ms-praha-18a17-2026',row:'court-ms-praha-18a17',ref:'18 A 17/2026-215',file:'129-ms-praha-18-a-17-2026-215-2026-10-12-original.pdf',hash:'33d054fc5c5286b43e4beccd27edb8978dd263ed9c3577e8f9c3f737879e0a83',pages:13},
 {id:'doc-cz-ms-pha-2026-10-12-18-a-23-2026-209',case:'case-cz-ms-praha-18a23-2026',row:'court-ms-praha-18a23',ref:'18 A 23/2026-209',file:'130-ms-praha-18-a-23-2026-209-2026-10-12-original.pdf',hash:'5b5527a005536b0150e0cfb701d07376bae41b6da7b4cfd934e6c702181aef1f',pages:11}
];
for(const q of specs){
 const d=batch.documents.find(x=>x.id===q.id);
 must(d,'missing original record '+q.id);
 must(d.issue_date==='2026-10-12'&&d.received_date===null,'no date of service is to be published');
 must(d.reference===q.ref&&d.institution_id==='CZ-MS-PHA','invalid issuer/reference');
 must(d.document_type==='state_record'&&d.submission_side==='incoming_from_state_or_public_institution','wrong Godot side');
 must(d.case_ids.length===1&&d.case_ids[0]===q.case,'wrong case association');
 must(d.closes_timer_ids?.length===1&&d.closes_timer_ids[0]==='timer-court-'+(q.row.endsWith('18a17')?'18a17':'18a23')+'-2026','previous waiting timer not closed by the order');
 must(d.public.pdf==='documents/report-04082026-010/'+q.file,'source PDF URL mismatch');
 must(d.public.sha256===q.hash&&d.public.source_original_sha256===q.hash,'source/public SHA metadata mismatch');
 must(d.public.verification_status.includes('git_blob_byte_identical'),'original integrity not declared');
 const raw=await readFile('web/'+d.public.pdf);
 must(raw.subarray(0,5).toString()==='%PDF-'&&raw.subarray(-4096).includes(Buffer.from('%%EOF')),'invalid PDF '+q.id);
 must(createHash('sha256').update(raw).digest('hex')===q.hash,'published PDF differs from source '+q.id);
 const info=execFileSync('pdfinfo',['web/'+d.public.pdf],{encoding:'utf8'});
 must(new RegExp('Pages:\\s+'+q.pages+'\\b').test(info),'PDF pages changed '+q.id);
 const txt=execFileSync('pdftotext',['web/'+d.public.pdf,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
 must(txt.includes(q.ref.replace('-', ''))||txt.includes(q.ref.split('-')[0]),'original does not contain docket reference '+q.id);
 const c=cases.cases.find(x=>x.id===q.case);
 must(c&&c.latest_state_document_id===q.id,'wrong case original decision link');
 const row=courts.rows.find(x=>x.id===q.row);
 must(row&&row.godot_document_ids.includes(q.id),'no court section cross-link '+q.id);
 if(q.row==='court-ms-praha-18a23'){
   must(c.cassation_status==='dated_2026-10-30_original_uploaded_filing_unverified'&&c.latest_prepared_pleading_document_id==='doc-cz-dd-2026-10-30-kasacni-msp-18a23','newly documented cassation must remain dated, not filed');
   must(row.remedy_cs.includes('30. 10. 2026')&&row.remedy_cs.includes('nejsou doloženy'),'CZ court annotation must identify dated complaint without inventing service');
   must(row.remedy_en.includes('30 October 2026')&&row.remedy_en.includes('unverified'),'EN court annotation must identify dated complaint without inventing service');
 }else{
   must(c.cassation_status==='in_preparation_not_filed','wrong A17 remedy status');
   must(row.remedy_cs.includes('Připravuje se kasační stížnost')&&!row.remedy_cs.includes('kasační stížnost byla podána'),'A17 cassation status wrongly published');
   must(row.remedy_en.includes('being prepared'),'missing A17 EN court state');
 }
 must(row.remedy_cs.includes(q.ref),'missing case reference in CZ remedy');
 must(t.documents[q.id]?.includes('being prepared'),'missing English Godot translation');
 must(cz.includes('id="'+q.id+'"')&&en.includes('id="en-'+q.id+'"'),'CZ/EN Godot missing original entry '+q.id);
 must(cz.includes(q.file)&&en.includes(q.file),'CZ/EN Godot links not to original '+q.id);
 must(!d.user_title.includes('doručen')&&!d.evidence_note.includes('doručen')&&!d.evidence_note.includes('20. 10. 2026'),'service date accidentally published');
}
const nsz=JSON.parse(await readFile('web/data/nsz-prelitigation-timeline.json','utf8'));
must(nsz.counts.total===30&&nsz.counts.incoming===5&&nsz.counts.outgoing===21&&nsz.counts.archival===4,'NSZ 30-record archive must remain untouched');
const timers=JSON.parse(await readFile('web/data/process-timers.json','utf8'));
for (const id of ['timer-court-18a17-2026','timer-court-18a23-2026']) {
 must(!(timers.timers||[]).some(x=>x.id===id),'decided case still active as an old waiting timer '+id);
 must((timers.resolved_process_steps||[]).some(x=>x.id===id&&x.status==='resolved_by_document'&&x.decision_date==='2026-10-12'),'decided case is missing from the completed process genealogy '+id);
}
console.log('PRAGUE TWO ORIGINAL COURT PDFS / CZ-EN GODOT / CASE LINK / CASSATION PREPARATION / NO DELIVERY DATE: OK');
