import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const check=(ok,msg)=>{if(!ok)throw Error('PRAHA-CHURCH-OCT30: '+msg)};
const path='project-memory/documents-2026-supplement-2026-10-30-vsz-praha-mk-appeal.json';
const source=JSON.parse(await readFile(path,'utf8'));
const manifest=JSON.parse(await readFile('project-memory/document-sources.json','utf8'));
const trans=JSON.parse(await readFile('project-memory/english-godot-translations.json','utf8'));
const cases=JSON.parse(await readFile('project-memory/cases.json','utf8'));
const timers=JSON.parse(await readFile('project-memory/process-timers.json','utf8'));
const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');
const churchCz=await readFile('web/kc/index.html','utf8');
const churchEn=await readFile('web/kc/en.html','utf8');
check(manifest.sources.some(x=>x.path===path),'original two-doc source not in manifest');
check(source.documents.length===2,'only the two new files may enter this publication');
const specs=[
 {id:'doc-cz-vsz-pha-2026-10-27-1-vzn-1678-2026-173',day:'2026-10-27',issuer:'CZ-VSZ-PHA',size:367267,pages:6,hash:'fabc711c936c21cc1299b5cf28cbdc1223d006788770a7288bcc72c343888e1f',name:'142-vsz-praha-1-vzn-1678-2026-173-2026-10-27-original.pdf'},
 {id:'doc-cz-dd-2026-10-28-mk-dodatek-rozkladu-universal-church-of-cannabis',day:'2026-10-28',issuer:'CZ-DD',size:69867,pages:2,hash:'b3fa903962ef7a68e8e0fec1cf6d04c7f766813719f14c8cc435ca6c89b33b9a',name:'143-mk-2026-10-28-dodatek-rozkladu-universal-church-of-cannabis-original.pdf'}
];
for(const q of specs) {
 const item=source.documents.find(d=>d.id===q.id);
 check(item&&item.issue_date===q.day&&item.received_date===null&&item.institution_id===q.issuer,'issue/service date or issuer mismatch '+q.id);
 check(item.public.pdf==='documents/report-04082026-010/'+q.name,'PDF path differs '+q.id);
 check(item.public.sha256===q.hash&&item.public.source_original_sha256===q.hash,'declared original hash differs '+q.id);
 const buffer=await readFile('web/'+item.public.pdf);
 check(buffer.length===q.size&&buffer.subarray(0,5).toString()==='%PDF-','original PDF missing/changed '+q.id);
 check(createHash('sha256').update(buffer).digest('hex')===q.hash,'not source-identical original '+q.id);
 const info=execFileSync('pdfinfo',['web/'+item.public.pdf],{encoding:'utf8'});
 check(new RegExp('Pages:\\s+'+q.pages+'\\b').test(info),'page count incorrect '+q.id);
 check(typeof trans.documents[q.id]==='string'&&trans.documents[q.id].length>120,'CZ/EN translation incomplete '+q.id);
}
const vsz=source.documents[0],mk=source.documents[1];
check(vsz.submission_side==='incoming_from_state_or_public_institution'&&vsz.document_type==='state_record','VSZ must be incoming Prague, never Olomouc');
check(cz.includes('id="'+vsz.id+'"')&&en.includes('id="en-'+vsz.id+'"'),'VSZ Prague missing CZ/EN Godot');
check(cz.includes('142-vsz-praha-1-vzn-1678-2026-173')&&en.includes('142-vsz-praha-1-vzn-1678-2026-173'),'VSZ original not linked in both languages');
check(vsz.evidence_note.includes('jedno pochybení')&&vsz.evidence_note.includes('dvouměsíční lhůtě'),'VSZ admitted late answer not accurately described');
check(cases.cases.find(x=>x.id==='CASE-CZ-VSZ-PHA-1VZN1678-2026')?.related_document_ids?.includes(vsz.id),'Prague prosecutorial case link missing');
check(mk.submission_side==='outgoing_from_user_or_alliance'&&mk.justice_slalom.archive_number===151&&mk.justice_slalom.recipients[0].institution_id==='CZ-MK','MK addendum not correctly classified in user filings');
check(!cz.includes('<tr id="'+mk.id+'"')&&!en.includes('<tr id="en-'+mk.id+'"'),'own filing improperly inserted as incoming Godot item');
const sl=JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));
check(sl.rows.some(x=>x.document_id===mk.id&&x.date==='2026-10-28'&&x.recipient_id==='CZ-MK'&&x.pdf===mk.public.pdf),'Church MK appeal not published in Justicni slalom');
for(const [page,language] of [[churchCz,'CZ'],[churchEn,'EN']]){
 check(page.includes(mk.public.pdf),'Church '+language+' does not link actual source PDF');
 check(page.includes('Universal Church of Cannabis'),'Church '+language+' missing notified name');
 check(page.includes('MK-S 6893/2026'),'Church '+language+' missing original proceeding reference');
 check(page.includes('MK 53547/2026 SOCNS')&&page.includes('MK 53559/2026 SOCNS'),'Church '+language+' lost historic Ministry decisions');
}
check(timers.timers.find(x=>x.id==='timer-admin-mk-2026-07-22')?.latest_related_filing_id===mk.id,'church remonstrance process not updated');
const ns=JSON.parse(await readFile('web/data/nsz-prelitigation-timeline.json','utf8'));
check(ns.counts.total===30,'30 historic NSZ records changed');
console.log('PRAGUE VSZ vs OLOMOUC / ORIGINAL 6+2 PAGES / GODOT CZ+EN / CHURCH CZ+EN / SLALOM / MK REMONSTRANCE: PASS');
