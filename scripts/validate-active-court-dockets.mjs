import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path,'utf8'));
const fail = message => { throw new Error('ACTIVE-COURT-DOCKETS: '+message); };
const must = (condition,message) => { if(!condition) fail(message); };

const [registry, publicRegistry, cases, sourceManifest, slalom, liveScript, courtCss] = await Promise.all([
  readJson('project-memory/active-court-dockets.json'),
  readJson('web/data/active-court-dockets.json'),
  readJson('project-memory/cases.json'),
  readJson('project-memory/document-sources.json'),
  readJson('web/data/justice-slalom.json'),
  readFile('web/live-dockets.js','utf8'),
  readFile('web/live-dockets.css','utf8')
]);

must(registry.status==='binding','kanonický registr není binding');
must(JSON.stringify(registry)===JSON.stringify(publicRegistry),'veřejný soudní registr není přesná build kopie kanonického registru');
must(Array.isArray(registry.rows)&&registry.rows.length===12,`očekáváno 12 soudních větví, nalezeno ${registry.rows?.length}`);
must(JSON.stringify(registry.table_contract.width_percent)==='[42,18,18,12,10]','šířky sloupců nejsou 42/18/18/12/10');
must(registry.table_contract.first_column_is_dominant===true,'první sloupec není označen jako dominantní');
must(registry.table_contract.sticky_three_bar_navigation===true,'sticky třílišťová navigace není závazná');

const caseMap=new Map((cases.cases||[]).map(x=>[x.id,x]));
const documents=new Map();
for(const source of sourceManifest.sources||[]){
  const payload=await readJson(source.path);
  for(const item of payload.documents||[]){
    const previous=documents.get(item.id)||{};
    documents.set(item.id,{...previous,...item,public:{...(previous.public||{}),...(item.public||{})}});
  }
}
const slalomIds=new Set((slalom.rows||[]).map(r=>r.document_id));
const rootLinks=new Set(['https://www.konopijelek.cz','https://www.konopijelek.cz/']);

const requiredRefs=[
  '2 T 104/2010','15 Nt 3104/2026','2 T 65/2011','15 Nt 3106/2026',
  '15 Nt 3103/2026-53','9 To 315/2026-140','15 Nt 3105/2026-54','9 To 316/2026-219',
  '18 A 17/2026','18 A 23/2026','15 A 44/2026','6 As 207/2026',
  '8 Ad 9/2026','15 Ad 14/2026','45 T 1/2024','11 To 88/2024-2990',
  '15 T 11/2025','5 To 248/2026','10 C 69/2026','3 Cmo 24/2026-26'
];
const allText=JSON.stringify(registry);
for(const ref of requiredRefs) must(allText.includes(ref),'registr postrádá '+ref);

for(const ref of ['II. ÚS 664/12','IV. ÚS 4859/12','II. ÚS 1311/13','II. ÚS 289/14','III. ÚS 396/16',
  '3 Tz 1/2012','8 Tdo 1231/2011','6 Tdo 1493/2014','11 Tdo 181/2015','6 Tdo 323/2016',
  '11 Tdo 61/2018','11 Tdo 426/2018','11 Tdo 1455/2018','11 Tdo 1332/2019','11 Tdo 1478/2019','11 Tdo 674/2020',
  '1 As 395/2019']) must(allText.includes(ref),'historický přezkum postrádá '+ref);

for(const row of registry.rows){
  must(row.id&&row.reference&&row.court_cs&&row.court_en,'řádek nemá id/reference/soud: '+row.id);
  must((row.merit_cs||'').length>=80&&row.merit_en?.length>=80,'meritní anotace je příliš krátká: '+row.id);
  must(row.remedy_cs&&row.remedy_en&&row.supreme_cs&&row.supreme_en,'řádek nemá opravnou/vrcholnou větev: '+row.id);
  must(Array.isArray(row.links)&&row.links.length>=1,'řádek nemá „Vše zveřejněné“: '+row.id);
  for(const link of row.links){
    must(link.href&&!rootLinks.has(String(link.href).replace(/\/$/,'')+'/'),'obecný homepage odkaz Konopí je lék je zakázán: '+row.id);
    must(link.label_cs?.includes('Vše zveřejněné')||link.label_cs?.includes('Rozhodnutí Vrchního soudu'),'CZ link nemá věcný popisek: '+row.id);
  }
  for(const cid of row.case_ids||[]) must(caseMap.has(cid),'řádek odkazuje na neexistující case_id '+cid);
  for(const did of row.godot_document_ids||[]){
    const d=documents.get(did);
    must(d,'Godot document id neexistuje: '+did);
    must(d.submission_side==='incoming_from_state_or_public_institution'||d.document_type==='state_record','Godot vazba není příchozí listina: '+did);
  }
  for(const did of row.slalom_document_ids||[]){
    const d=documents.get(did);
    must(d,'Slalom document id neexistuje: '+did);
    must(d.submission_side==='outgoing_from_user_or_alliance'||d.document_type==='user_submission','Slalom vazba není vlastní podání: '+did);
    must(slalomIds.has(did),'vlastní podání není ve veřejném Justičním slalomu: '+did);
  }
  for(const cid of row.case_ids||[]){
    const c=caseMap.get(cid);
    for(const key of ['decision_document_id','latest_state_document_id']){
      const did=c?.[key];
      if(!did) continue;
      const d=documents.get(did);
      if(d && (d.submission_side==='incoming_from_state_or_public_institution'||d.document_type==='state_record')){
        must((row.godot_document_ids||[]).includes(did),`${row.id} neobsahuje ${key} z cases.json: ${did}`);
      }
    }
    const filing=c?.last_filing_document_id;
    if(filing && documents.has(filing)){
      const d=documents.get(filing);
      if(d.submission_side==='outgoing_from_user_or_alliance'||d.document_type==='user_submission'){
        must((row.slalom_document_ids||[]).includes(filing),`${row.id} neobsahuje poslední obranu z cases.json: ${filing}`);
      }
    }
  }
}

const ftv=registry.rows.find(x=>x.id==='court-media-ftv-prima');
must(ftv,'chybí mediální FTV/CNN větev');
must(ftv.media_cs.includes('NSS 1 As 395/2019'),'FTV/CNN mediální větev neobsahuje NSS 1 As 395/2019');
must((ftv.godot_document_ids||[]).includes('doc-cz-vs-pha-2026-09-14-3-cmo-24-2026-26'),'FTV/CNN větev nemá rozhodnutí VS 3 Cmo 24/2026-26');
must((ftv.slalom_document_ids||[]).includes('doc-cz-ekk-2026-10-02-os-praha10-ftv-prima-doplneni-zaloby'),'FTV/CNN větev nemá nové podání v Justičním slalomu');

const ct=registry.rows.find(x=>x.id==='court-media-ct');
must(ct?.media_cs.includes('1 As 395/2019'),'ČT mediální větev neobsahuje NSS 1 As 395/2019');

for(const token of [
  "const registryUrl = '/ai-advocate-evidence-lab/data/active-court-dockets.json'",
  "className = 'docket-bar-stack'",
  "className = 'active-courts-table'",
  "wrapper.append(controls, courtShell)",
  "if (stateLoveShell) wrapper.append(stateLoveShell)",
  "if (slalomShell) wrapper.append(slalomShell)"
]) must(liveScript.includes(token),'live-dockets.js postrádá kontrakt: '+token);

for(const token of [
  'position:sticky',
  '.live-dockets .active-courts-table th:nth-child(1){width:42%}',
  '.live-dockets .active-courts-table th:nth-child(2){width:18%}',
  '.live-dockets .active-courts-table th:nth-child(3){width:18%}',
  '.live-dockets .active-courts-table th:nth-child(4){width:12%}',
  '.live-dockets .active-courts-table th:nth-child(5){width:10%}',
  '@media(max-width:1100px)',
  'overflow-x:auto'
]) must(courtCss.includes(token),'live-dockets.css postrádá: '+token);

must(!liveScript.includes("source.href = 'https://www.konopijelek.cz/'"),'vrátil se obecný odkaz Konopí je lék místo deep-linků');

console.log(`ACTIVE COURT DOCKETS OK: ${registry.rows.length} větví, meritum 42 %, sticky 3 lišty, Godot ↔ Slalom ↔ cases křížově ověřeno.`);
