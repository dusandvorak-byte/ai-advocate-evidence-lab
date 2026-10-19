import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path,'utf8'));
const fail = message => { throw new Error('ACTIVE-COURT-DOCKETS: '+message); };
const must = (condition,message) => { if(!condition) fail(message); };

const productionWorkflow = await readFile('.github/workflows/publish-gh-pages-branch.yml','utf8');
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
must(Array.isArray(registry.rows)&&registry.rows.length>=13,`očekáváno nejméně 13 soudních a předžalobních větví, nalezeno ${registry.rows?.length}`);
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
const nszRow=registry.rows.find(row=>row.id==='court-nsz-prelitigation-6nzn1737');
must(nszRow,'NSZ nemá samostatný řádek předžalobní větve');
must(nszRow.phase==='prelitigation_not_a_court_case','NSZ nesmí být prezentováno jako již zahájené soudní řízení');
must(nszRow.reference.includes('6 NZN 1737/2026')&&nszRow.reference.includes('14. 7. 2026'),'NSZ nemá přesný milník předžalobní výzvy');
must(nszRow.merit_cs.includes('svátek dobytí Bastily')&&nszRow.merit_cs.includes('20. dubna 2026'),'NSZ postrádá svátek Bastily nebo počátek uživatelské evidence');
must(nszRow.links?.[0]?.href==='https://www.konopijelek.cz/nejvyssi-statni-zastupitelstvi-on-line/','NSZ nemá schválený tematický deep-link');
must(nszRow.timeline_asset==='data/nsz-prelitigation-timeline.json','NSZ nemá dynamický soupis zdrojových listin');
const nszCase=caseMap.get('CASE-CZ-NSZ-6NZN1737-2026');
must(nszCase?.pre_litigation_milestone_on==='2026-07-14'&&nszCase?.court_case_status==='court_filing_not_evidenced','NSZ case chybně představuje předžalobní krok jako podanou žalobu');
const nszTimeline=await readJson('web/data/nsz-prelitigation-timeline.json');
must(nszTimeline.case_id==='CASE-CZ-NSZ-6NZN1737-2026'&&nszTimeline.milestone==='2026-07-14','NSZ timeline má nesprávný case nebo datum');
must(nszTimeline.period_start==='2026-04-20'&&nszTimeline.official_from==='2026-05-01','NSZ timeline chybně zahrnuje období');
const official=nszTimeline.groups?.find(g=>g.id==='incoming_nsz')?.items||[];
const own=nszTimeline.groups?.find(g=>g.id==='outgoing_to_nsz')?.items||[];
must(official.length>0&&own.length>0,'NSZ timeline nemá obě procesní strany');
must(nszTimeline.counts.incoming===official.length&&nszTimeline.counts.outgoing===own.length&&nszTimeline.counts.total===official.length+own.length,'NSZ timeline počty nejsou odvozené ze záznamů');
const refsFromRecipients=d=>[...(d.justice_slalom?.recipients||[]).map(x=>x.institution_id),...(d.recipients||[]).map(x=>typeof x==='string'?x:x.institution_id||x.id)].filter(Boolean);
const isOwnToNsz=d=>d.issue_date>='2026-04-20'
  &&(d.submission_side==='outgoing_from_user_or_alliance'||d.document_type==='user_submission')
  &&(refsFromRecipients(d).includes('CZ-NSZ')||(refsFromRecipients(d).length===0&&/6\s*NZN\s*1737\s*\/\s*2026/.test(String(d.reference||''))&&/NSZ|státnímu zastupitelství/i.test(String(d.user_title||''))));
const isOfficialNsz=d=>d.issue_date>='2026-05-01'&&d.institution_id==='CZ-NSZ'
  &&(d.submission_side==='incoming_from_state_or_public_institution'||d.document_type==='state_record');
const sorted=items=>items.every((item,i)=>i===0||items[i-1].date>=item.date);
for(const [kind,arr,selector] of [['příchozí NSZ',official,isOfficialNsz],['vlastní podání NSZ',own,isOwnToNsz]]){
  must(sorted(arr),'NSZ timeline není chronologicky sestupná: '+kind);
  const expected=[...documents.values()].filter(selector).map(x=>x.id).sort();
  const actual=arr.map(x=>x.document_id).sort();
  must(JSON.stringify(expected)===JSON.stringify(actual),'NSZ timeline není úplným odrazem kanonicky evidovaných dokumentů: '+kind);
  for(const item of arr){
    const doc=documents.get(item.document_id);
    must(doc&&selector(doc),'NSZ timeline obsahuje cizí či neověřený dokument: '+item.document_id);
    const target=doc.public?.pdf||doc.public?.html;
    if(target)must(item.href&&item.href.includes(String(target).replace(/^\/?web\//,'')),'NSZ má nesprávný odkaz na originální evidovaný zdroj: '+item.document_id);
  }
}
must(own.some(x=>x.date==='2026-07-14'&&x.document_id==='doc-cz-dd-2026-07-14-slalom-34'),'NSZ timeline neobsahuje hlavní předžalobní výzvu ze 14. 7. 2026');
must(nszTimeline.provenance_note_cs.includes('nikoli nedoložené'),'NSZ timeline neodlišuje doložený soupis od tvrzení o úplnosti');


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
const expectedCt='https://www.konopijelek.cz/ceska-televize/';
const expectedPrima='https://www.konopijelek.cz/novinky/cnn-prima-news/';
must(ct.links?.[0]?.href===expectedCt,'ČT: Vše zveřejněné nevede na konkrétní stránku /ceska-televize/');
must(ct.media_links?.[0]?.href===expectedCt,'ČT: mediální odkaz NSS 1 As 395/2019 nevede na stránku /ceska-televize/');
must(ftv.links?.[0]?.href===expectedPrima,'FTV/CNN Prima: Vše zveřejněné nevede na konkrétní stránku /novinky/cnn-prima-news/');
must(!JSON.stringify(ct).includes('novinky/zaloba-na-ceskou-televizi-za-cenzuru/'),'ČT: zůstal neaktuální odkaz na starou stránku');

// Výslovně schválené deep-linky – u každé kauzy odkaz na věcnou stránku.
const userApprovedLinks={
  'court-media-ct':'https://www.konopijelek.cz/ceska-televize/',
  'court-media-ftv-prima':'https://www.konopijelek.cz/novinky/cnn-prima-news/',
  'court-ms-praha-18a17':'https://www.konopijelek.cz/policie/',
  'court-ms-praha-18a23':'https://www.konopijelek.cz/ministerstvo-spravedlnosti/',
  'court-ms-praha-15a44-nss6as207':'https://www.konopijelek.cz/ministerstvo-vnitra/',
  'court-ms-praha-health':'https://www.konopijelek.cz/ministerstvo-zdravotnictvi/'
};
for(const [id,href] of Object.entries(userApprovedLinks)){
  const row=registry.rows.find(x=>x.id===id);
  must(row?.links?.[0]?.href===href,`Chybný deep-link pro ${id}: očekáváno ${href}`);
}
const health=registry.rows.find(x=>x.id==='court-ms-praha-health');
must(health?.follow_up?.status==='preparing'&&health.follow_up.kind==='planned_not_filed',
  'Antidiskriminační žaloba nesmí být označena jako podaná');
for(const phrase of ['nemocných','lékařů','lékárníků','teprve připravována']){
  must(String(health.merit_cs+' '+health.remedy_cs).includes(phrase),
    'Zdravotnická anotace neobsahuje připravovanou žalobu: '+phrase);
}
must(health.merit_en.includes('not evidenced as filed')&&health.remedy_en.includes('still being prepared'),
  'EN parita nesprávně prezentuje připravovanou antidiskriminační žalobu');
for(const id of ['case-cz-ms-praha-8ad9-2026','case-cz-ms-praha-15-ad-14-2026']){
  const c=caseMap.get(id);
  must(c?.planned_follow_up?.status==='preparing_not_filed'&&c.planned_follow_up.kind==='antidiscrimination_action',
    'Cases nesynchronizují plánovanou antidiskriminační žalobu: '+id);
  must(Boolean(c.decided_on)&&Boolean(c.decision_document_id),
    'Ukončená soudní větev MZ/SÚKL postrádá rozhodnutí: '+id);
}

for(const token of [
  "const registryUrl = '/ai-advocate-evidence-lab/data/active-court-dockets.json'",
  "data/nsz-prelitigation-timeline.json",
  "className = 'active-nsz-timeline'",
  "for (const group of nszTimeline.groups || [])",
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
  'overflow-x:auto',
  '.live-dockets .active-nsz-timeline'
]) must(courtCss.includes(token),'live-dockets.css postrádá: '+token);

must(!liveScript.includes("source.href = 'https://www.konopijelek.cz/'"),'vrátil se obecný odkaz Konopí je lék místo deep-linků');
for(const token of [
  'expected_courts_sha=',
  'court_try=$attempt',
  'courts_sha_ok=1',
  'Živý soudní registr není po publikaci shodný s buildem'
]) must(productionWorkflow.includes(token),'Produkční live gate nemá retry-safe kontrolu SHA-256: '+token);


console.log(`ACTIVE COURT DOCKETS OK: ${registry.rows.length} větví, meritum 42 %, sticky 3 lišty, Godot ↔ Slalom ↔ cases křížově ověřeno.`);
