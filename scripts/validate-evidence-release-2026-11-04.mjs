import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const must=(ok,message)=>{if(!ok)throw Error('REVIEWED-BATCH-2026-11-04: '+message);};
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const packet=await json('project-memory/evidence-release-2026-11-04.json');
const source=await json('project-memory/documents-2026-supplement-2026-11-04-reviewed-batch.json');
const normalized=await json('project-memory/documents-2026.json');
const cases=await json('project-memory/cases.json');
const court=await json('web/data/active-court-dockets.json');
const slalom=await json('web/data/justice-slalom.json');
const translations=await json('project-memory/english-godot-translations.json');
const sourceManifest=await json('project-memory/document-sources.json');
const byId=new Map(normalized.documents.map(d=>[d.id,d]));
const sourceById=new Map(source.documents.map(d=>[d.id,d]));
const caseMap=new Map(cases.cases.map(c=>[c.id,c]));
must(packet.documents.length===16,'inventory must retain all sixteen source inputs');
must(new Set(packet.documents.map(d=>d.number)).size===16,'input numbers repeated');
must(new Set(packet.documents.map(d=>d.canonical_document_id)).size===15,'canonical deduplication must yield fifteen identities');
const newRows=packet.documents.filter(x=>x.disposition==='new_redacted_public_copy');
must(newRows.length===9&&packet.privacy_documents.length===9,'nine reviewed public copies required');
must(packet.new_incoming_count===4&&packet.new_outgoing_count===5,'incoming/outgoing split changed');
must(sourceManifest.sources.filter(x=>x.path==='project-memory/documents-2026-supplement-2026-11-04-reviewed-batch.json').length===1,'batch not registered once');
must(packet.documents.filter(x=>x.disposition==='already_registered_exact_binary').length===5,'existing exact binaries changed');
must(packet.documents.find(x=>x.number===5).canonical_document_id===packet.documents.find(x=>x.number===6).canonical_document_id,'5 and 6 duplicated');
must(packet.documents.find(x=>x.number===10).canonical_document_id==='doc-cz-pcr-krpt-2026-10-20-krpt-276756-2-cj-2026-0700kr','existing police extension given a new identity');
let pageTotal=0;
for(const record of packet.documents){
  const d=byId.get(record.canonical_document_id);
  must(d,'inventory target missing: '+record.number);
  must(d.public?.pdf===record.pdf,'inventory/canonical PDF differs: '+record.number);
  const b=await readFile('web/'+record.pdf);
  must(sha(b)===record.public_sha256,'public bytes differ: '+record.number);
  must(b.subarray(0,5).toString()==='%PDF-'&&b.subarray(-2048).includes(Buffer.from('%%EOF')),'invalid PDF: '+record.number);
}
for(const r of packet.privacy_documents){
  const d=byId.get(r.id),src=sourceById.get(r.id);
  must(d&&src,'new source missing: '+r.id);
  must(d.public.sha256===r.sha256&&src.public.source_original_sha256===r.source_original_sha256,'provenance mismatch: '+r.id);
  must(r.sha256!==r.source_original_sha256,'redacted copy labeled byte-identical: '+r.id);
  const b=await readFile('web/'+r.pdf);
  must(b.length===r.size_bytes&&sha(b)===r.sha256,'new public bytes changed: '+r.id);
  const indexed=execFileSync('git',['show',':web/'+r.pdf],{maxBuffer:Math.max(r.size_bytes+65536,2*1024*1024)});
  must(sha(indexed)===r.sha256,'Git changed reviewed PDF bytes: '+r.id);
  const attrs=execFileSync('git',['check-attr','--cached','text','diff','--','web/'+r.pdf],{encoding:'utf8'});
  must(attrs.includes('text: unset')&&attrs.includes('diff: unset'),'new PDFs must be treated as binary by Git: '+r.id);
  const info=execFileSync('pdfinfo',['web/'+r.pdf],{encoding:'utf8'});
  must(new RegExp('Pages:\\s+'+r.page_count+'\\b').test(info),'page count changed: '+r.id);
  pageTotal+=r.page_count;
  const text=execFileSync('pdftotext',['-layout','web/'+r.pdf,'-'],{encoding:'utf8'});
  must(!/12\.\s*(?:ledna|1\.)\s*1962/i.test(text),'exact birth date remains: '+r.id);
  if(r.number===7)must(!/invalidní\s+důchod\s+III|199\s*750|2\s*508,44|Vlastnictví\s+domu|neexistence\s+exekuce/.test(text),'private financial/health passage remains in personal submission');
  if([8,9].includes(r.number))must(/invalidní/.test(text)&&/199\s*750/.test(text),'official financial/health text removed against user instruction');
  must(r.pixel_changes_outside_redactions===0&&r.page_layout_preserved,'source layout preservation failed: '+r.id);
  must(translations.documents[r.id],'English description missing: '+r.id);
  must(src.received_date===null,'service inferred from issue date: '+r.id);
  for(const cid of d.case_ids){
    const c=caseMap.get(cid);
    must(c?.related_document_ids?.includes(d.id),'case/document relation not reciprocal: '+d.id+' '+cid);
  }
  for(const rel of d.relations||[])must(byId.has(rel.target_id),'orphan document relation: '+d.id+' '+rel.target_id);
  const page=await readFile('web/'+d.public.html,'utf8');
  must(page.includes(d.public.pdf),'detail page lacks direct PDF: '+d.id);
  must(src.public.public_copy_note.includes('Redigov'),'source provenance label missing: '+d.id);
}
must(pageTotal===68,'source page counts not retained');
const newIds=new Set(newRows.map(x=>x.canonical_document_id));
const incoming=[...newIds].filter(id=>byId.get(id).submission_side==='incoming_from_state_or_public_institution');
const own=[...newIds].filter(id=>byId.get(id).submission_side==='outgoing_from_user_or_alliance');
must(incoming.length===4&&own.length===5,'canonical sides differ from intake');
const newSlalom=slalom.rows.filter(r=>newIds.has(r.document_id));
must(newSlalom.length===17,'new addressee rows incomplete');
must(byId.get('doc-cz-ekk-2026-11-03-stiznost-krpm-145410').justice_slalom.recipients.some(r=>r.institution_id==='CZ-MV'&&r.role==='primary'),'author-designated Ministry recipient missing');
for(const id of own){
  const d=byId.get(id);
  must(newSlalom.filter(r=>r.document_id===id).length===d.justice_slalom.recipients.length,'recipient count differs: '+id);
  must(d.justice_slalom.source_kind==='redacted_original_from_user_binary','Slalom source kind wrong: '+id);
}
const primary=['web/index.html','web/en.html','web/kc/index.html','web/kc/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
for(const file of primary){
  const html=await readFile(file,'utf8');
  const en=file.includes('/en.html')||file.includes('/news/');
  must(!html.includes('id="procesni-casovace"'),'obsolete public timer returned: '+file);
  for(const id of newIds)must(html.includes(id),'surface missing stable id: '+file+' '+id);
  for(const record of newRows)must(html.includes(record.pdf),'surface missing PDF: '+file+' '+record.number);
  const start=html.indexOf(en?'<table id="en-chronology-list"':'<table id="chronologie-seznam"');
  must(start>=0,'Godot table missing: '+file);
  const table=html.slice(start,html.indexOf('</table>',start)+8);
  for(const id of incoming)must(table.includes('<tr id="'+(en?'en-':'')+id+'"'),'incoming row absent: '+file+' '+id);
  for(const id of own)must(!table.includes('<tr id="'+(en?'en-':'')+id+'"'),'outgoing became Godot main row: '+file+' '+id);
  must(html.includes(en?'Redacted original PDF':'Redigovaný originál PDF'),'Slalom copy label absent: '+file);
}
for(const [cid,ref] of [['case-cz-os-pro-2t104-2010-obnova','15 Nt 3104/2026-341'],['case-cz-os-pro-2t65-2011-obnova','15 Nt 3106/2026-337']]){
  const c=caseMap.get(cid),d=byId.get(c.latest_state_document_id);
  must(d?.reference===ref&&d.issue_date==='2026-11-02','latest court decision wrong: '+cid);
  const row=court.rows.find(r=>r.case_ids.includes(cid));
  must(row?.godot_document_ids.includes(d.id)&&row.remedy_en.includes('free or reduced-fee defence'),'court projection stale: '+cid);
}
must(caseMap.get('CASE-CZ-NSZ-6NZN1737-2026').court_case_status==='court_filing_not_evidenced','conditional NSZ pleading became filed');
must(caseMap.has('case-cz-ns-zin208-2026-infz')&&caseMap.has('case-cz-nsz-sin55-2026-infz'),'separate information branches missing');
const forbidden=new Set(packet.privacy_documents.map(x=>x.source_original_sha256));
forbidden.add(packet.documents.find(x=>x.number===6).source_sha256);
forbidden.add(packet.source_batch_sha256);
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await scan(p);else if(/\.(pdf|zip)$/i.test(p))must(!forbidden.has(sha(await readFile(p))),'unredacted private source in public tree: '+p);}}
await scan('web');
const tracked=execFileSync('git',['ls-files'],{encoding:'utf8'}).split('\n').filter(Boolean);
must(!tracked.some(p=>p.startsWith('ROZSIRENY_BALICEK/')||p.endsWith('WEB_Evidence_Lab_ROZSIRENY_BALICEK_2026-11-04.zip')),'unredacted source archive tracked');
console.log('REVIEWED_BATCH_2026_11_04_OK: 16 inputs; 15 canonical identities; 9 new redacted PDFs / 68 pages; 4 incoming, 5 outgoing, 17 addressee rows; CZ/EN and four brands verified.');
