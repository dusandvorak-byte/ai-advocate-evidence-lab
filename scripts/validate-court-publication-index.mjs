import {readFile} from 'node:fs/promises';
const get=async p=>JSON.parse(await readFile(p,'utf8'));
const [index,dockets,manifest,inst]=await Promise.all([
  get('web/data/court-publication-index.json'),
  get('project-memory/active-court-dockets.json'),
  get('project-memory/document-sources.json'),
  get('project-memory/institutions.json')
]);
const err=s=>{throw Error('COURT-PUBLICATION-INDEX: '+s)};
const must=(condition,s)=>{if(!condition)err(s)};
const documents=new Map();
for(const source of manifest.sources||[]){
 const payload=await get(source.path);
 for(const d of payload.documents||[]){
  const old=documents.get(d.id)||{};
  documents.set(d.id,{...old,...d,public:{...(old.public||{}),...(d.public||{})}});
 }
}
const all=[...documents.values()];
const recipientIds=d=>[...(d.justice_slalom?.recipients||[]).map(x=>x.institution_id),...(d.recipients||[]).map(x=>typeof x==='string'?x:(x.institution_id||x.id))].filter(Boolean);
const own=d=>d.submission_side==='outgoing_from_user_or_alliance'||['user_submission','alliance_submission'].includes(d.document_type);
const link=d=>d.public?.pdf||d.public?.html;
must(index.rows?.length===dockets.rows.length,'not all docket rows have an index');
must(new Set(index.rows.map(x=>x.docket_id)).size===dockets.rows.length,'duplicated or missing case');
const instSet=new Set(inst.institutions.map(x=>x.id));
for(const court of dockets.rows) {
 const row=index.rows.find(x=>x.docket_id===court.id);
 must(row&&JSON.stringify(row.case_ids)===JSON.stringify(court.case_ids||[]),'wrong case references: '+court.id);
 must(row.external_archive_url===court.links?.[0]?.href,'external Konopí je lék link changed for '+court.id);
 must(/^https:\/\/www\.konopijelek\.cz\/.+/.test(row.external_archive_url),'case deep link missing for '+court.id);
 must(row.institution_ids.length>=1 && row.institution_ids.every(x=>instSet.has(x)),'unknown institution '+court.id);
 must(row.groups?.length===2 && row.groups[0].id==='incoming' && row.groups[1].id==='outgoing','two source groups required '+court.id);
 const incoming=row.groups[0].items,outgoing=row.groups[1].items;
 must(row.counts.incoming===incoming.length&&row.counts.outgoing===outgoing.length&&row.counts.total===incoming.length+outgoing.length,'counts '+court.id);
 must(row.counts.total>0,'empty case '+court.id);
 for(const [kind,items] of [['incoming',incoming],['outgoing',outgoing]]) {
  must(new Set(items.map(x=>x.document_id)).size===items.length,'duplicate document '+court.id+' '+kind);
  must(items.every((x,i)=>i===0||items[i-1].date>=x.date),'not descending '+court.id+' '+kind);
  for(const item of items){
    const doc=documents.get(item.document_id);
    must(doc&&link(doc),'not a published canonical doc '+item.document_id);
    must((kind==='outgoing')===own(doc),'incorrect document side '+item.document_id);
    must(item.date===doc.issue_date,'date mismatch '+item.document_id);
    must(item.href===(
      /^https?:\/\//.test(link(doc))?link(doc):
       '/ai-advocate-evidence-lab/'+String(link(doc)).replace(/^\/?web\//,'').replace(/^\//,'')
      ),'not direct canonical document link '+item.document_id);
    must(item.reference.length>0 && item.institution.length>0,'document identifier missing '+item.document_id);
  }
 }
 for(const doc of all){
  if(!link(doc)||!doc.issue_date)continue;
  const isOwn=own(doc);
  const direct=isOwn?recipientIds(doc).some(x=>row.institution_ids.includes(x)):row.institution_ids.includes(doc.institution_id);
  if(direct)must((isOwn?outgoing:incoming).some(x=>x.document_id===doc.id),'institution record omitted: '+court.id+' / '+doc.id);
 }
}
const script=await readFile('web/live-dockets.js','utf8');
const css=await readFile('web/live-dockets.css','utf8');
for(const token of ['court-publication-index.json','publicationRows.get(row.id)','active-case-publications-toggle','active-case-publication-groups','publication.external_archive_url','item.institution'])must(script.includes(token),'missing live display token '+token);
for(const token of ['active-court-selected-documents','active-case-publications-toggle','active-case-publication-groups','grid-template-columns:repeat(2,minmax(0,1fr))'])must(css.includes(token),'missing responsive style '+token);
must(script.includes("className = 'active-court-selected-documents'"),'missing full-width evidence reader inside courts');
must(script.includes('courtBody.append(scroll, selectedDocuments)'), 'evidence reader not inside top-level court panel');
must(script.includes('published.append(button)'), 'document buttons not placed in fifth column');
must(script.includes('nszDetail = disclosure'), 'NSZ 29 chronology is missing');
must(script.includes('disclosure.open = true'), 'NSZ chronology must open in the shared full-width reader');
must(!script.includes("const extendedRow = document.createElement('tr')"),'regression: extra table rows wreck layout');
must(!script.includes("tbody.append(extendedRow)"),'regression: publication rows leak into parent table');
console.log('COURT_PUBLICATION_INDEX OK:',index.rows.length,'dockets; published direct entries',index.rows.reduce((a,x)=>a+x.counts.total,0));