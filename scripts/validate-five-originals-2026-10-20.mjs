import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const err=s=>{throw Error('ORIGINALS-2026-10-20: '+s)};
const assert=(v,s)=>{if(!v)err(s)};
const data=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-10-20-four-original-state-records.json','utf8'));
const euda=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-10-19-euda-reply.json','utf8'));
const manifest=JSON.parse(await readFile('project-memory/document-sources.json','utf8'));
const expected=[
 ['doc-eu-euda-2026-10-19-exo-fhp-pd-26-d-110','2026-10-19','EXO/FHP/pd (26) D 110','120-euda-exo-fhp-pd-26-d-110-2026-10-19-original.pdf','b2ea6fb0b56a73ee2fccae2ff4b595094551b91a49ff3ceee0a9d11bd885d9c2',2],
 ['doc-cz-nsz-2026-10-15-sin-72-2026-16','2026-10-15','SIN 72/2026-16','121-nsz-sin-72-2026-16-2026-10-15-original.pdf','449bf64f34e118607367dfe1db4cc133b0276f6b31fc1f7b3c46d311ee1dba72',2],
 ['doc-cz-uoou-2026-10-19-uoou-05841-26-7','2026-10-19','UOOU-05841/26-7','122-uoou-05841-26-7-2026-10-19-original.pdf','144d1a4b7ee620b48b4ffe013368cb937fd4c04124b9dc8f7ba8d4756b5b81c4',2],
 ['doc-cz-cak-2026-10-15-10-32-000925-26-0002','2026-10-15','10.32-000925/26-0002','123-cak-10-32-000925-26-0002-2026-10-15-original.pdf','3c8bcb8dd6acf93f276bad0431c811039e88fb9976655e62c10ab565e8801b6e',1],
 ['doc-cz-os-pro-2026-10-13-st-7-2026','2026-10-13','St 7/2026','124-os-prostejov-st-7-2026-2026-10-13-original.pdf','85e201e363569c3b32c985fbc2e548428462bd3ba4150525a8d54713691d2ca5',2]
];
assert(data.documents.length===4&&euda.documents.length===1,'wrong incoming record count');
for(const filename of ['project-memory/documents-2026-supplement-2026-10-20-four-original-state-records.json','project-memory/documents-2026-supplement-2026-10-19-euda-reply.json'])
 assert(manifest.sources.some(x=>x.path===filename),'supplement not registered: '+filename);
const docs=new Map([...euda.documents,...data.documents].map(d=>[d.id,d]));
const translations=JSON.parse(await readFile('project-memory/english-godot-translations.json','utf8'));
const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');
for(const [id,date,ref,file,sha,pages] of expected){
 const d=docs.get(id);
 assert(d,'canonical document missing '+id);
 assert(d.issue_date===date&&d.received_date===null,'issue/service dates corrupted '+id);
 assert(d.reference.includes(ref),'docket id corrupt '+id);
 assert(d.document_type==='state_record'&&d.submission_side==='incoming_from_state_or_public_institution','not Godot incoming '+id);
 const path='web/documents/report-04082026-010/'+file;
 assert(d.public?.pdf===path.slice(4)&&d.public?.intended_pdf===path.slice(4),'PDF location wrong '+id);
 assert(d.public?.verification_status.includes('git_blob_byte_identical'),'not original '+id);
 const bytes=await readFile(path);
 assert(bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(-4096).includes(Buffer.from('%%EOF')),'invalid PDF '+id);
 const h=createHash('sha256').update(bytes).digest('hex');
 assert(h===sha&&d.public.sha256===sha&&d.public.source_original_sha256===sha,'original differs at '+id);
 const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});
 assert(new RegExp('Pages:\\s+'+pages+'\\b').test(info),'page count mismatch '+id);
 assert(translations.documents[id]?.length>30,'EN description missing '+id);
 assert(cz.includes('id="'+id+'"')&&en.includes('id="en-'+id+'"'),'CZ/EN Godot document row missing '+id);
 assert(cz.includes(file)&&en.includes(file),'CZ/EN original PDF link missing '+id);
}
const nsz=docs.get('doc-cz-nsz-2026-10-15-sin-72-2026-16');
assert(nsz.relations.some(x=>x.target_id==='doc-cz-dd-2026-10-10-ns-nsz-msp-mv-ppr-infz-tp'),'NSZ must link to 10 October request');
assert(nsz.evidence_note.includes('30 dnů ode dne doručení')&&nsz.received_date===null,'NSZ 30 days not from actual service');
const uoou=docs.get('doc-cz-uoou-2026-10-19-uoou-05841-26-7');
assert(uoou.relations.some(x=>x.target_id==='doc-cz-dd-2026-10-02-uoou-stiznost-necinnost'),'ÚOOÚ response not linked to Oct 2 complaint');
for(const ref of ['UOOU-05841/26','UOOU-05793/26','UOOU-05032/26'])assert(uoou.reference.includes(ref),'ÚOOÚ case reference missing: '+ref);
const cak=docs.get('doc-cz-cak-2026-10-15-10-32-000925-26-0002');
assert(cak.relations.some(x=>x.target_id==='doc-cz-dd-2026-10-10-cak-uocr-pro-bono'),'ČAK answer not linked to pro bono request');
const os=docs.get('doc-cz-os-pro-2026-10-13-st-7-2026');
assert(os.issue_date==='2026-10-13'&&os.case_ids.includes('case-cz-ks-brno-9to316-2026'),'OS date or appeal genealogy is incorrect');
const cases=JSON.parse(await readFile('project-memory/cases.json','utf8'));
assert(cases.cases.find(c=>c.id==='case-cz-ks-brno-9to316-2026')?.status==='complaint_decided_service_confirmed_2026-10-07','missing certified 7 Oct court service');
const nszTimeline=JSON.parse(await readFile('web/data/nsz-prelitigation-timeline.json','utf8'));
assert(nszTimeline.counts.total===30&&nszTimeline.groups.reduce((n,g)=>n+g.items.length,0)===30,'NSZ timeline must contain 29 previously published records plus the October 15 SIN 72 reply');
const official=nszTimeline.groups.find(x=>x.id==='incoming_nsz')?.items||[];
const own=nszTimeline.groups.find(x=>x.id==='outgoing_to_nsz')?.items||[];
const archive=nszTimeline.groups.find(x=>x.id==='historical_archive')?.items||[];
assert(official.length===5&&own.length===21&&archive.length===4,'original 29 entries must remain unchanged, with just one new official NSZ item');
assert(official.some(x=>x.document_id==='doc-cz-nsz-2026-10-15-sin-72-2026-16'&&x.href?.includes('121-nsz-sin-72-2026-16-2026-10-15-original.pdf')),'October NSZ SIN 72 original not in its proper evidence group');
const act=JSON.parse(await readFile('project-memory/active-court-dockets.json','utf8'));
assert(act.rows.length===13,'unexpected court row count');
console.log('ALL FIVE ORIGINAL PDFs, CZ/EN GODOT, AND NSZ: 29 PRESERVED + 1 NEW = 30: OK');
