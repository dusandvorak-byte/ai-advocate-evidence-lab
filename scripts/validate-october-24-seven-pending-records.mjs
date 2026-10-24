import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const must=(v,m)=>{if(!v)throw Error('OCT24-PROVENANCE:'+m)};
const a=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-10-24-three-originals.json','utf8'));
const b=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-10-24-four-additional-records.json','utf8'));
const sources=JSON.parse(await readFile('project-memory/document-sources.json','utf8'));
const translations=JSON.parse(await readFile('project-memory/english-godot-translations.json','utf8'));
const cases=JSON.parse(await readFile('project-memory/cases.json','utf8'));
const court=JSON.parse(await readFile('project-memory/active-court-dockets.json','utf8'));
const cs=await readFile('web/zpravy/04082026-010.html','utf8'),en=await readFile('web/news/04082026-010.html','utf8');
must(a.documents.length===3&&b.documents.length===4,'seven distinct user attachments required, eighth is duplicate');
for(const p of ['project-memory/documents-2026-supplement-2026-10-24-three-originals.json','project-memory/documents-2026-supplement-2026-10-24-four-additional-records.json'])must(sources.sources.some(x=>x.path===p),'source not registered '+p);
for(const d of [...a.documents,...b.documents]){
 must(!!translations.documents[d.id],'English annotation missing '+d.id);
 must(d.received_date===null,'delivery date cannot be invented '+d.id);
 must(d.public.source_original_sha256?.length===64,'missing uploaded original provenance '+d.id);
 const outgoing=d.submission_side==='outgoing_from_user_or_alliance';
 if(outgoing)must(!cs.includes('<tr id="'+d.id+'"')&&!en.includes('<tr id="en-'+d.id+'"'),'own filing in incoming authorities table');
 else must(cs.includes('<tr id="'+d.id+'"')&&en.includes('<tr id="en-'+d.id+'"'),'CZ/EN timeline row missing '+d.id);
 if(d.public.pdf){
  const p='web/'+d.public.pdf;const buffer=await readFile(p);
  must(buffer.subarray(0,5).toString()==='%PDF-'&&buffer.length===d.public.source_original_size_bytes,'PDF header/bytes '+d.id);
  must(createHash('sha256').update(buffer).digest('hex')===d.public.source_original_sha256,'not exact original '+d.id);
  const info=execFileSync('pdfinfo',[p],{encoding:'utf8'});must(new RegExp('Pages:\\s+'+d.public.source_original_page_count+'\\b').test(info),'pages changed '+d.id);
  must(cs.includes(d.public.pdf)&&en.includes(d.public.pdf),'CZ/EN original links missing '+d.id);
 } else {
  must(d.public.verification_status.includes('public_pdf_pending'),'missing public PDF cannot be represented as original '+d.id);
  must(!cs.includes('href="undefined"')&&!en.includes('href="undefined"'),'unsafe missing file link');
 }
}
const courtIds=['court-prostejov-2t104-15nt3104','court-prostejov-2t65-15nt3106','court-prostejov-15nt3103-9to315','court-prostejov-15nt3105-9to316'];
for(const id of courtIds){const c=court.rows.find(x=>x.id===id);must(c&&c.godot_document_ids.includes('doc-cz-dd-2026-10-21-os-prostejov-doplneni-bezplatne-obhajoby')&&c.godot_document_ids.includes('doc-cz-dd-2026-10-24-cak-doplneni-zadosti-urceni-advokata'),'missing four-way court links '+id);}
const ns=JSON.parse(await readFile('web/data/nsz-prelitigation-timeline.json','utf8'));
must(ns.counts.total===30,'preexisting NSZ timeline altered');
console.log('OCT24: 7 unique documents; 3 exact original public PDFs, 4 evidence entries with missing originals accurately labelled; CZ/EN; original dates; court links; NSZ 30 OK');