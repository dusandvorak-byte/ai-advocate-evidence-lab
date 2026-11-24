import {readFile,writeFile,mkdir} from 'node:fs/promises';

const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const manifest=await readJson('project-memory/document-sources.json');
const dockets=await readJson('project-memory/active-court-dockets.json');
const cases=await readJson('project-memory/cases.json');
const institutions=await readJson('project-memory/institutions.json');
const byCase=new Map((cases.cases||[]).map(x=>[x.id,x]));
const byInstitution=new Map((institutions.institutions||[]).map(x=>[x.id,x]));
const docs=new Map();
for (const entry of manifest.sources||[]) {
  const payload=await readJson(entry.path);
  for(const doc of payload.documents||[]) {
    const old=docs.get(doc.id)||{};
    docs.set(doc.id,{...old,...doc,public:{...(old.public||{}),...(doc.public||{})}});
  }
}
const root='/ai-advocate-evidence-lab/';
const directHref=doc=>{
  const path=doc.public?.pdf||doc.public?.html;
  if(!path)return null;
  if(/^https?:\/\//.test(path))return path;
  return root+String(path).replace(/^\/?web\//,'').replace(/^\//,'');
};
const isOutgoing=doc=>doc.submission_side==='outgoing_from_user_or_alliance' ||
  ['user_submission','alliance_submission'].includes(doc.document_type);
const recipientIds=doc=>[
  ...(doc.justice_slalom?.recipients||[]).map(x=>x.institution_id),
  ...(doc.recipients||[]).map(x=>typeof x==='string'?x:(x.institution_id||x.id))
].filter(Boolean);
const normalizedRef=s=>String(s||'').replace(/\s+/g,'').toUpperCase();
const refParts=s=>(String(s||'').match(/\b\d{1,2}\s*[A-Za-zÁ-ž]{1,5}\s*\d{1,5}\s*\/\s*(?:19|20)\d{2}\b/g)||[]).map(normalizedRef);
const bridgeInstitutionIds={
  'court-prostejov-2t104-15nt3104':['CZ-OS-PRO'],
  'court-prostejov-2t65-15nt3106':['CZ-OS-PRO'],
  'court-prostejov-15nt3103-9to315':['CZ-OS-PRO','CZ-KS-BRN'],
  'court-prostejov-15nt3105-9to316':['CZ-OS-PRO','CZ-KS-BRN'],
  'court-ms-praha-18a17':['CZ-MS-PHA','CZ-NCOZ'],
  'court-ms-praha-18a23':['CZ-MS-PHA','CZ-MSP'],
  'court-ms-praha-15a44-nss6as207':['CZ-MS-PHA','CZ-NSS','CZ-MV'],
  'court-ms-praha-health':['CZ-MS-PHA','CZ-MZ'],
  'court-ms-praha-45t1':['CZ-MS-PHA','CZ-VS-PHA'],
  'court-ostrava-15t11-5to248':['CZ-OS-OST','CZ-KS-OST'],
  'court-media-ct':['CZ-OS-PHA4','CZ-CT','CZ-RADA-CT'],
  'court-media-ftv-prima':['CZ-OS-PHA10','CZ-VS-PHA'],
  'court-nsz-prelitigation-6nzn1737':['CZ-NSZ']
};
const iso=doc=>/^\d{4}-\d\d-\d\d$/.test(doc.issue_date||'')?doc.issue_date:null;
const sort=(a,b)=>b.date.localeCompare(a.date)||a.document_id.localeCompare(b.document_id);
const all=[...docs.values()];
const output={schema_version:'1.0',source:'project-memory/document-sources.json',scope:'documentary_index_for_every_court_and_related_agency',generated_from_source:true,rows:[]};
for(const row of dockets.rows||[]) {
  const caseIds=new Set(row.case_ids||[]);
  const rowCases=[...caseIds].map(id=>byCase.get(id)).filter(Boolean);
  const institutes=new Set([...(bridgeInstitutionIds[row.id]||[]),...rowCases.map(x=>x.institution_id).filter(Boolean)]);
  for(const id of institutes)if(!byInstitution.has(id))throw new Error('Missing institution '+id+' for '+row.id);
  const ids=new Set([...(row.godot_document_ids||[]),...(row.slalom_document_ids||[])]);
  const refs=new Set(refParts(row.reference));
  for(const item of rowCases) {
    for(const id of item.related_document_ids||[])ids.add(id);
    for(const key of ['decision_document_id','latest_state_document_id','last_filing_document_id'])if(item[key])ids.add(item[key]);
    for(const p of refParts(item.reference))refs.add(p);
  }
  const inbound=[],outbound=[];
  for(const d of all) {
    const href=directHref(d),date=iso(d);
    if(!href||!date)continue;
    const own=isOutgoing(d);
    const recipients=recipientIds(d);
    const sameCase=(d.case_ids||[]).some(id=>caseIds.has(id));
    const explicit=ids.has(d.id);
    const matchingReference=refParts(d.reference).some(r=>refs.has(r));
    const directInstitution=own?recipients.some(id=>institutes.has(id)):institutes.has(d.institution_id);
    if(!sameCase&&!explicit&&!matchingReference&&!directInstitution)continue;
    const institution=own?
      (recipients.filter(id=>institutes.has(id)).map(id=>byInstitution.get(id)?.short_name||byInstitution.get(id)?.name||id).join(', ')||
        recipients.map(id=>byInstitution.get(id)?.short_name||byInstitution.get(id)?.name||id).join(', ')||
        (row.court_cs||'orgán')) :
      (byInstitution.get(d.institution_id)?.short_name||byInstitution.get(d.institution_id)?.name||d.institution_id);
    const reference=(d.reference&&String(d.reference).trim()) ||
      (d.justice_slalom?.recipients||[]).map(x=>x.reference).filter(Boolean).join('; ')||
      'bez přiděleného č. j. / sp. zn.';
    (own?outbound:inbound).push({
      document_id:d.id,date,reference,institution,href,
      link_kind:d.public?.pdf?'pdf':'evidence'
    });
  }
  const unique=arr=>[...new Map(arr.map(x=>[x.document_id,x])).values()].sort(sort);
  const incoming=unique(inbound),outgoing=unique(outbound);
  output.rows.push({
    docket_id:row.id,case_ids:[...caseIds],institution_ids:[...institutes],
    external_archive_url:row.links?.[0]?.href||null,
    groups:[
      {id:'incoming',label_cs:'Listiny státních a dalších orgánů',label_en:'Documents from courts and public bodies',items:incoming},
      {id:'outgoing',label_cs:'Podání soudu a dalším orgánům',label_en:'Filings addressed to courts and public bodies',items:outgoing}
    ],
    counts:{incoming:incoming.length,outgoing:outgoing.length,total:incoming.length+outgoing.length}
  });
}
if(output.rows.length!==(dockets.rows||[]).length)throw new Error('Docket publication row mismatch');
await mkdir('web/data',{recursive:true});
await writeFile('web/data/court-publication-index.json',JSON.stringify(output,null,2)+'\n','utf8');
console.log('COURT_PUBLICATION_INDEX',output.rows.length,'dockets,',output.rows.reduce((v,x)=>v+x.counts.total,0),'docket-document links');