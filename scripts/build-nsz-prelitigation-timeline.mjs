import {readFile,writeFile,mkdir} from 'node:fs/promises';

const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const manifest=await readJson('project-memory/document-sources.json');
const translation=await readJson('project-memory/english-godot-translations.json');
const all=new Map();
for(const source of manifest.sources||[]){
  const data=await readJson(source.path);
  for(const d of data.documents||[]){
    const previous=all.get(d.id)||{};
    all.set(d.id,{...previous,...d,public:{...(previous.public||{}),...(d.public||{})}});
  }
}
const root='/ai-advocate-evidence-lab/';
const recipients=d=>[
  ...(d.justice_slalom?.recipients||[]).map(x=>x.institution_id),
  ...(d.recipients||[]).map(x=>typeof x==='string'?x:(x.institution_id||x.id))
].filter(Boolean);
const outgoing=d=>d.issue_date>='2026-04-20'
  && (d.submission_side==='outgoing_from_user_or_alliance'||d.document_type==='user_submission')
  && (recipients(d).includes('CZ-NSZ')
      ||(recipients(d).length===0&&/6\s*NZN\s*1737\s*\/\s*2026/.test(String(d.reference||''))&&/NSZ|státnímu zastupitelství/i.test(String(d.user_title||''))));
const incoming=d=>d.issue_date>='2026-05-01'
  && d.institution_id==='CZ-NSZ'
  && (d.submission_side==='incoming_from_state_or_public_institution'||d.document_type==='state_record');
const linked=d=>{
  const pdf=d.public?.pdf;
  const html=d.public?.html;
  const path=pdf||html||'';
  if(!path)return {href:null,link_kind:'not_published'};
  if(/^https?:\/\//i.test(path))return {href:path,link_kind:pdf?'pdf':'evidence'};
  return {href:root+String(path).replace(/^\/?web\//,'').replace(/^\//,''),link_kind:pdf?'pdf':'evidence'};
};
const desc=d=>{
  const t=translation.documents?.[d.id];
  return typeof t==='string'&&t.trim()?t.trim().slice(0,280):null;
};
const row=d=>({
  document_id:d.id,
  date:d.issue_date,
  received_date:d.received_date||null,
  reference:d.reference||'',
  title_cs:d.user_title||d.reference||d.id,
  description_en:desc(d),
  ...linked(d)
});
const sort=(a,b)=>String(b.date).localeCompare(String(a.date))||a.document_id.localeCompare(b.document_id);
const official=[...all.values()].filter(incoming).map(row).sort(sort);
const own=[...all.values()].filter(outgoing).map(row).sort(sort);
if(!official.length||!own.length)throw new Error('NSZ_TIMELINE: v kanonických zdrojích chybí listiny NSZ nebo vlastní podání');
const allDates=[...official,...own].map(x=>x.date).sort();
const packet={
 schema_version:'1.0',
 source:'project-memory/document-sources.json',
 case_id:'CASE-CZ-NSZ-6NZN1737-2026',
 status:'evidenced_publications_only',
 period_start:'2026-04-20',
 official_from:'2026-05-01',
 milestone:'2026-07-14',
 reference:'6 NZN 1737/2026',
 groups:[
  {id:'incoming_nsz',title_cs:'Listiny a reakce NSZ',title_en:'Documents and responses from the Supreme Public Prosecutor’s Office',items:official},
  {id:'outgoing_to_nsz',title_cs:'Moje podání adresovaná NSZ',title_en:'My filings addressed to the Supreme Public Prosecutor’s Office',items:own}
 ],
 counts:{incoming:official.length,outgoing:own.length,total:official.length+own.length},
 first_evidenced_date:allDates[0]||null,
 last_evidenced_date:allDates.at(-1)||null,
 provenance_note_cs:'Seznam zachycuje doložené listiny a podání v kanonickém registru Evidence Lab, nikoli nedoložené dokumenty ani tvrzení o úplnosti externího archivu. Pokud z období od 20. dubna 2026 některé podání chybí, nesmí být automaticky domyšleno.',
 provenance_note_en:'This list covers recorded documents in the Evidence Lab canonical registry, not undocumented items or an unverified claim of completeness of the external archive.'
};
await mkdir('web/data',{recursive:true});
await writeFile('web/data/nsz-prelitigation-timeline.json',JSON.stringify(packet,null,2)+'\n','utf8');
console.log('NSZ_PRELITIGATION_TIMELINE',packet.counts,'first',packet.first_evidenced_date,'last',packet.last_evidenced_date);
