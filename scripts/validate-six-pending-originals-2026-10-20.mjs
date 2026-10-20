import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const assert=(v,m)=>{if(!v)throw new Error('SIX-MISSED-ORIGINALS: '+m)};
const path='project-memory/documents-2026-supplement-2026-10-20-six-pending-originals.json';
const batch=JSON.parse(await readFile(path,'utf8'));
const manifests=JSON.parse(await readFile('project-memory/document-sources.json','utf8'));
const translations=JSON.parse(await readFile('project-memory/english-godot-translations.json','utf8'));
const cases=JSON.parse(await readFile('project-memory/cases.json','utf8'));
const courts=JSON.parse(await readFile('project-memory/active-court-dockets.json','utf8'));
const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');
assert(manifests.sources.some(x=>x.path===path),'document batch not loaded');
assert(batch.documents.length===6,'expected exactly six pending items, including the two new 20 October originals');
const expected=[
['doc-cz-os-pro-2026-10-15-15-nt-3104-2026-238','2026-10-15','15 Nt 3104/2026-238','125-os-prostejov-15-nt-3104-2026-238-2026-10-15-original.pdf','ec18d8ab440d6fe757fe1737ddb8b7168a08a5aedfcb44a08a8a74d2b9a4ded5',198008,2],
['doc-cz-os-pro-2026-10-15-15-nt-3106-2026-235','2026-10-15','15 Nt 3106/2026-235','126-os-prostejov-15-nt-3106-2026-235-2026-10-15-original.pdf','852721d13e7a2c2f0102f4b5ef84f69b7c0066e6b2cc7ef1f9a388a6092d3443',197741,2],
['doc-cz-vsz-olo-2026-10-12-3-vzn-265-2026-7','2026-10-12','3 VZN 265/2026-7','127-vsz-olomouc-3-vzn-265-2026-7-2026-10-12-original.pdf','1b13ec35c8a9ac38203049365385112e36301fc6386309314699da4caf51f221',273020,2],
['doc-cz-vsz-olo-2026-10-12-3-vzn-266-2026-8','2026-10-12','3 VZN 266/2026-8','128-vsz-olomouc-3-vzn-266-2026-8-2026-10-12-original.pdf','7dec42be8bb799d2749078275932ff7c8fff59a6c75dbad8be2a1d6f90e64498',271682,2],
['doc-cz-uoou-2026-10-20-uoou-06760-26-4','2026-10-20','UOOU-06760/26-4','131-uoou-06760-26-4-2026-10-20-original.pdf','d92573fa223f93033007c099112c2c647bdbb43530d4215858bfd17aed319864',102840,2],
['doc-cz-pcr-krpt-2026-10-20-krpt-276756-2-cj-2026-0700kr','2026-10-20','KRPT-276756-2/ČJ-2026-0700KR','132-krpt-276756-2-2026-10-20-original.pdf','3a9fb986e65871005a7537729be6278853d50a23b28c3c78a29b9d54a2d8859f',242909,1]];
for(const [id,date,ref,file,sha,size,pages] of expected){
 const d=batch.documents.find(x=>x.id===id); assert(d,'missing '+id);
 assert(d.issue_date===date&&d.received_date===null,'issue/service date mismatch: '+id);
 assert(d.reference===ref&&d.public.pdf.endsWith(file),'wrong docket or original path: '+id);
 assert(d.public.source_original_sha256===sha&&d.public.sha256===sha&&d.public.source_original_size_bytes===size,'bad PDF metadata: '+id);
 const pdf=await readFile('web/'+d.public.pdf);assert(pdf.length===size&&pdf.subarray(0,5).toString()==='%PDF-','missing original '+id);
 assert(createHash('sha256').update(pdf).digest('hex')===sha,'not binary-identical original '+id);
 const info=execFileSync('pdfinfo',['web/'+d.public.pdf],{encoding:'utf8'});assert(new RegExp('Pages:\\s+'+pages+'\\b').test(info),'page count changed '+id);
 assert(cz.includes('id="'+id+'"')&&en.includes('id="en-'+id+'"'),'missing Godot CZ/EN row '+id);
 assert(cz.includes(file)&&en.includes(file),'CZ/EN PDF original links missing '+id);
 assert(translations.documents[id]?.length>50,'English translation missing '+id);
 assert(d.submission_side==='incoming_from_state_or_public_institution'&&d.document_type==='state_record','incorrect main row type '+id);
}
for(const [caseId,docId,courtId] of [
 ['case-cz-os-pro-2t104-2010-obnova',expected[0][0],'court-prostejov-2t104-15nt3104'],
 ['case-cz-os-pro-2t65-2011-obnova',expected[1][0],'court-prostejov-2t65-15nt3106']
]){
 const c=cases.cases.find(x=>x.id===caseId),row=courts.rows.find(x=>x.id===courtId);
 assert(c?.related_document_ids?.includes(docId)&&row?.godot_document_ids?.includes(docId),'court case relationship missing: '+docId);
 assert(c.status==='active','court renewal must remain active: '+caseId);
}
const u=cases.cases.find(x=>x.id==='case-cz-mv-infz-ganja-for-all-animals');
assert(u?.decision_document_id==='doc-cz-mv-2026-10-07-mv-134798-4-so-2026'&&u.related_document_ids.includes(expected[4][0]),'ministerial ruling not preserved while adding UOOU decision');
assert(batch.documents[4].evidence_note.includes('marně uplynula')&&batch.documents[4].evidence_note.includes('nevyhověl'),'UOOU acknowledged delay must not be confused with granted measures');
const kr=cases.cases.find(x=>x.id==='CASE-CZ-PCR-KRPT-203594-2026');
assert(kr?.related_document_ids?.includes(expected[5][0]),'new police reply not case linked');
const timers=JSON.parse(await readFile('web/data/process-timers.json','utf8'));
const t=timers.timers?.find(x=>x.id==='timer-admin-krpt-infz-2026-10-15-extended-2026-11-09');
assert(t&&t.start_date==='2026-10-15'&&t.due_date==='2026-11-09'&&t.latest_document_id===expected[5][0],'new exact 9 November deadline missing');
const nsz=JSON.parse(await readFile('web/data/nsz-prelitigation-timeline.json','utf8'));
assert(nsz.counts.total===30&&nsz.counts.incoming===5&&nsz.counts.outgoing===21&&nsz.counts.archival===4,'NSZ 30-item archive altered');
console.log('ALL SIX OFFICIAL ORIGINALS, TWO 20 OCT DECISIONS, CZ/EN GODOT, CASE LINKS, 9 NOV DEADLINE, NSZ=30: OK');