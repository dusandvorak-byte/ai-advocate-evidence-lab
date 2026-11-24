import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const since='2026-05-01';
const begin='<!-- STATE-ATTACHMENTS:BEGIN -->';
const end='<!-- STATE-ATTACHMENTS:END -->';
const stripPanelMarkers=html=>html.replaceAll(begin,'').replaceAll(end,'');
const stripPanel=html=>html.replace(/<!-- STATE-ATTACHMENTS:BEGIN -->[\s\S]*?<!-- STATE-ATTACHMENTS:END -->/g,'');
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const format=(date,lang)=>new Intl.DateTimeFormat(lang==='en'?'en-GB':'cs-CZ',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const englishTitle=new Map([
  ['doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-2','Order No. 54/2021 – Annex 2: Cannabinoid profiling methodology'],
  ['doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-3','Order No. 54/2021 – Annex 3: Quantitative determination of THC in plant materials'],
  ['doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-4','Order No. 54/2021 – Annex 4: Interpretation of cannabis analysis results'],
  ['doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-5','Order No. 54/2021 – Annex 5: Analysis of HHC / HHC-O and THCP'],
  ['doc-cz-ncoz-2026-05-20-ncoz-4346-2-cj-2026-410012','NCOZ statement of 20 May 2026'],
]);


/* The owner's dated 4 November intake is an additional chronology reference,
 * not a new issuance date or another copy of the PDF.  Only independently
 * verified, already-public binaries are included here.  Keep items 3–4's
 * historical dates and the standalone Godot counts unchanged. */
const DATED_BATCH_DATE='2026-11-04';
const datedBatchPins=[
  [3,'doc-cz-pcr-krpt-2026-08-20-rr-ku-54-2021','documents/report-04082026-010/67-krpt-priloha-rr-ku-54-2021.pdf','e48f9ef213cc03f3151cf5cf863d6a79e4d510e2d039e3d8aa5b792df7ec2c14','Rozkaz ředitele Kriminalistického ústavu č. 54/2021','Order No. 54/2021 of the Director of the Criminalistics Institute',false],
  [4,'doc-cz-pcr-krpt-2026-08-20-rr-ku-54-2021-priloha-1','documents/report-04082026-010/68-krpt-priloha-rr-ku-54-2021-priloha-1.pdf','8af176bed4b5462a2b551ef13b964c4aa38ae509649ca40c4f7779a24f61e1ca','Příloha č. 1 – metodika odběru reprezentativního vzorku rostlinného materiálu','Annex 1 – Sampling methodology for representative plant material',false],
  [5,'doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-2','documents/2026-11-04/rr-ku-54-2021-priloha-2.pdf','6a4fa57cd3a12ad6f74643b0815c60b0431682b35f194993d47567b9b0533213','Příloha č. 2 – metodika profilování kanabinoidů','Annex 2 – Cannabinoid profiling methodology',true],
  [6,'doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-3','documents/2026-11-04/rr-ku-54-2021-priloha-3.pdf','9e1d37506d0d991a17cb91c7dae43ceccbb4c531c3f0d0f6d947323afd57eea6','Příloha č. 3 – kvantitativní stanovení obsahu THC v rostlinných materiálech','Annex 3 – Quantitative determination of THC in plant materials',true],
  [7,'doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-4','documents/2026-11-04/rr-ku-54-2021-priloha-4.pdf','411b87167b8d33eea1e60c12eae3de1841209bde6316116101a51790052abe52','Příloha č. 4 – interpretace výsledků analýzy konopí','Annex 4 – Interpretation of cannabis analysis results',true],
  [8,'doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-5','documents/2026-11-04/rr-ku-54-2021-priloha-5.pdf','93c20a560730900e050815f87281815eb526d9b0341bc9df4916531a335a8664','Příloha č. 5 – analýza HHC / HHC-O a THCP','Annex 5 – Analysis of HHC / HHC-O and THCP',true],
  [2,"doc-cz-pcr-pp-2026-11-04-ppr-53675-9-cj-2026-990810","documents/2026-11-04/pcr-pp-2026-11-04-ppr-53675-9-cj-2026-990810-verejna-kopie.pdf","631afe9170487479e1848547e350f7fce0a2bdc4491186bdbaadf57f30553983","Policejní prezidium – PPR-53675-9/ČJ-2026-990810","Police Presidium – PPR-53675-9/ČJ-2026-990810",false,{"cs":"POLICEJNÍ PREZIDIUM","en":"POLICE PRESIDIUM","reference":"PPR-53675-9/ČJ-2026-990810"}],
  [15,"doc-cz-ms-pha-2026-11-04-18-a-17-2026-252","documents/2026-11-04/ms-pha-2026-11-04-18-a-17-2026-252-verejna-kopie.pdf","cdb340a06469f0cea10ab58271138cf703ecc717ee4299e6279ab92f0cc2b237","Městský soud v Praze – 18 A 17/2026-252","Municipal Court in Prague – 18 A 17/2026-252",false,{"cs":"MĚSTSKÝ SOUD V PRAZE","en":"MUNICIPAL COURT IN PRAGUE","reference":"18 A 17/2026-252"}],
  [17,"doc-cz-os-pro-2026-11-04-15-nt-3103-vyrozumeni","documents/2026-11-04/os-pro-2026-11-04-15-nt-3103-vyrozumeni-verejna-kopie.pdf","af8ea89fa935abac527b2abb5ef755fb74c447bd1a3d0165e861f94ad638a30e","Okresní soud v Prostějově – 15 Nt 3103/2026","District Court in Prostějov – 15 Nt 3103/2026",false,{"cs":"OKRESNÍ SOUD V PROSTĚJOVĚ","en":"DISTRICT COURT IN PROSTĚJOVĚ","reference":"15 Nt 3103/2026"}],
  [18,"doc-cz-os-pro-2026-11-04-15-nt-3105-vyrozumeni","documents/2026-11-04/os-pro-2026-11-04-15-nt-3105-vyrozumeni-verejna-kopie.pdf","049bff9a5c1ff54be18559b34d26175dd6e347b1c7aaedb7d51939f066f967c9","Okresní soud v Prostějově – sdělení doručené ve spise 15 Nt 3105/2026","Prostějov District Court – notice delivered under file 15 Nt 3105/2026",false,{"cs":"OKRESNÍ SOUD V PROSTĚJOVĚ","en":"DISTRICT COURT IN PROSTĚJOV","reference":"15 Nt 3105/2026 · PDF: 15 Nt 3103/2026"}],
  [31,"doc-cz-msp-2026-11-04-msp-898-2026-op-osv-8","documents/2026-11-04/msp-2026-11-04-msp-898-2026-op-osv-8-verejna-kopie.pdf","35e363adf247ac1fb6686c93bcce4dea530e8dfd67de47a6af9c5eb601f4406e","Ministerstvo spravedlnosti – MSP-898/2026-OP-OSV/8","Ministry of Justice – MSP-898/2026-OP-OSV/8",false,{"cs":"MINISTERSTVO SPRAVEDLNOSTI","en":"MINISTRY OF JUSTICE","reference":"MSP-898/2026-OP-OSV/8"}],
  [32,"doc-cz-mv-2026-11-03-mv-127234-8-obp-2026","documents/2026-11-04/mv-2026-11-03-mv-127234-8-obp-2026-verejna-kopie.pdf","1655282a2ca573879ab3007bb5d2e8a823e435cbcb8d286b487cb84c93027ab4","Ministerstvo vnitra – MV-127234-8/OBP-2026","Ministry of the Interior – MV-127234-8/OBP-2026",false,{"cs":"MINISTERSTVO VNITRA","en":"MINISTRY OF THE INTERIOR","reference":"MV-127234-8/OBP-2026"}],
];

export async function collectVerifiedDatedBatch(documents,attachments,root='web'){
  const byId=new Map();
  for(const d of documents){
    if(byId.has(d.id))throw Error('Duplicate canonical record: '+d.id);
    byId.set(d.id,d);
  }
  const attachmentIds=new Set(attachments.map(d=>d.id));
  const result=[];
  for(const [number,id,p,sha,cs,en,annex,record] of datedBatchPins){
    const d=byId.get(id);
    if(!d||d.release_excluded===true||d.submission_side!=='incoming_from_state_or_public_institution'||d.public?.pdf!==p||d.public?.sha256!==sha||(annex&&(!attachmentIds.has(id)||d.issue_date!==DATED_BATCH_DATE))||(!annex&&attachmentIds.has(id)))throw Error('Dated batch provenance mismatch: '+id);
    const bytes=await readFile(join(root,p));
    if(bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Dated batch public SHA mismatch: '+id);
    if(record&&d.document_type!=='state_record')throw Error('Dated state record type mismatch: '+id);
    result.push({number,id,p,sha,cs,en,annex,record});
  }
  return result.sort((a,b)=>a.number-b.number);
}
export function datedBatchPanel(batch,lang){
  const en=lang==='en';
  if(!batch.length)return '';
  const title=en?'Public records dated 4 November 2026':'Listiny k 4. listopadu 2026';
  const note=en?'Public records in the dated intake of 4 November 2026. The order and annex 1 refer to previously published text copies; their original issuance and historical record dates are unchanged. Annexes are not counted as new standalone state records.':'Listiny zařazené k 4. listopadu 2026. Rozkaz a příloha č. 1 odkazují na již zveřejněné textové kopie; původní datum vydání a historické evidence zůstává zachováno. Přílohy se nezapočítávají jako nové samostatné státní listiny.';
  const cards=batch.map(d=>{
    const link='/ai-advocate-evidence-lab/'+esc(d.p);
    return '<article class="latest-record-card dated-batch-card" data-dated-document-id="'+esc(d.id)+'" data-timeline-date="'+DATED_BATCH_DATE+'" data-approved-list-number="'+d.number+'"'+(d.annex?' data-attachment-id="'+esc(d.id)+'"':'')+'><p class="kicker">'+esc(format(DATED_BATCH_DATE,lang))+' · '+esc(d.record?(en?d.record.en:d.record.cs):(en?'CRIMINALISTICS INSTITUTE':'KRIMINALISTICKÝ ÚSTAV'))+'</p><h3><a href="'+link+'" target="_blank" rel="noopener">'+esc(en?d.en:d.cs)+'</a></h3><p class="latest-record-reference">'+esc(d.record?d.record.reference:(en?'Police response batch · Order No. 54/2021':'Dávka odpovědi · RŘ KÚ č. 54/2021'))+(d.annex||d.record?'':(en?' · existing public text copy':' · existující veřejná textová kopie'))+'</p><a class="latest-record-pdf" href="'+link+'" target="_blank" rel="noopener">'+(en?'PDF document':'Dokument v PDF')+'</a></article>';
  }).join('');
  return '<section id="dated-release-2026-11-04" class="state-attachments dated-release" data-timeline-date="'+DATED_BATCH_DATE+'" aria-label="'+esc(title)+'"><h3>'+esc(title)+'</h3><p>'+esc(note)+'</p><div class="latest-record-grid">'+cards+'</div></section>';
}

// Keep independent Godot decision counts intact. Include only final,
 // release-filtered canonical attachments whose actual PDF matches its public SHA.
export async function collectVerifiedAttachments(documents,root='web'){
  const result=[],ids=new Set(),paths=new Set();
  for(const d of documents){
    if(d.release_excluded===true||d.document_type!=='state_record_attachment'||d.submission_side!=='incoming_from_state_or_public_institution'||!(d.issue_date>=since)||!d.public?.pdf) continue;
    const p=d.public.pdf;
    if(!/^doc-[a-z0-9-]+$/.test(d.id)||!/^\d{4}-\d{2}-\d{2}$/.test(d.issue_date)||!/^documents\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.pdf$/.test(p)||!/^[a-f0-9]{64}$/.test(d.public.sha256||'')||!String(d.user_title||'').trim()||ids.has(d.id)||paths.has(p)) throw Error('Attachment identity, digest, date or path invalid: '+d.id);
    const bytes=await readFile(join(root,p));
    if(bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==d.public.sha256) throw Error('Attachment public SHA mismatch: '+d.id);
    ids.add(d.id);paths.add(p);result.push(d);
  }
  return result.sort((a,b)=>b.issue_date.localeCompare(a.issue_date)||a.id.localeCompare(b.id));
}

export function attachmentPanel(attachments,lang){
  const en=lang==='en';
  if(!attachments.length)return '';
  const rows=attachments.map(d=>{
    const title=en?(englishTitle.get(d.id)||d.user_title):d.user_title;
    // For the RR KU 54/2021 batch, 4 Nov is the response batch date,
    // not the 2021 order's issuance date.
    const isKu=d.id.startsWith('doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-');
    const dateLabel=isKu?(en?'Response batch dated ':'Dávka odpovědi ze dne '):(en?'Record date: ':'Datum evidence: ');
    return '<li data-attachment-id="'+esc(d.id)+'"><a href="/ai-advocate-evidence-lab/'+esc(d.public.pdf)+'" target="_blank" rel="noopener">'+esc(title)+'</a> <span>('+esc(dateLabel+format(d.issue_date,lang))+')</span></li>';
  }).join('');
  return begin+'<div class="state-attachments" aria-label="'+(en?'Verified attachments':'Ověřené přílohy')+'"><h3>'+(en?'Verified attachments with public PDFs':'Ověřené přílohy s veřejnými PDF')+'</h3><p>'+(en?'Listed separately from the count of standalone state records.':'Evidovány samostatně mimo počet samostatných státních listin.')+'</p><ul>'+rows+'</ul></div>'+end;
}

export function renderAttachmentSurface(html,attachments,latestDecisionDate,lang,home,batch=[]){
  html=stripPanel(html);
  if(!attachments.length)return html;
  const batchIds=new Set(batch.map(d=>d.id));
  const remaining=attachments.filter(d=>!batchIds.has(d.id));
  const other=stripPanelMarkers(attachmentPanel(remaining,lang));
  const panel=begin+datedBatchPanel(batch,lang)+other+end;
  if(home){
    const start=html.indexOf('<section id="latest-records"');
    const stop=html.indexOf('</header>',start);
    if(start<0||stop<0)throw Error('Missing latest-records header');
    const head=html.slice(start,stop);
    const latest=[latestDecisionDate,...attachments.map(d=>d.issue_date)].sort().at(-1);
    const en=lang==='en';
    const prefix=en?'Canonical evidence memory through ':'Kanonická důkazní paměť do ';
    const pattern=en?/<h2>Canonical evidence memory through [^<]+<\/h2>/:/<h2>Kanonická důkazní paměť do [^<]+<\/h2>/;
    if(!pattern.test(head))throw Error('Missing canonical latest heading');
    const updated=head.replace(pattern,'<h2>'+prefix+format(latest,lang)+'</h2>');
    return html.slice(0,start)+updated+html.slice(stop,stop+9)+panel+html.slice(stop+9);
  }
  const main=/<main(?:\s[^>]*)?>/;
  if(!main.test(html))throw Error('Missing chronology main element');
  return html.replace(main,m=>m+panel);
}

export async function finalizeAttachmentSurfaces({root='web',registryPath='project-memory/documents-2026.json'}={}){
  const {documents}=JSON.parse(await readFile(registryPath,'utf8'));
  const attachments=await collectVerifiedAttachments(documents,root);
  const batch=await collectVerifiedDatedBatch(documents,attachments,root);
  const latestDecisionDate=documents.filter(d=>d.release_excluded!==true&&d.document_type==='state_record'&&d.issue_date>=since).map(d=>d.issue_date).sort().at(-1);
  if(!latestDecisionDate)throw Error('Missing standalone state record date');
  const surfaces=[['index.html','cs',true],['en.html','en',true],['kc/index.html','cs',true],['kc/en.html','en',true],['zpravy/04082026-010.html','cs',false],['news/04082026-010.html','en',false]];
  for(const [path,lang,home] of surfaces){
    const target=join(root,path);
    const html=renderAttachmentSurface(await readFile(target,'utf8'),attachments,latestDecisionDate,lang,home,batch);
    const observed=[...html.matchAll(/data-attachment-id="([^"]+)"/g)].map(m=>m[1]);
    const expectedAttachmentIds=[...batch.filter(d=>d.annex).map(d=>d.id),...attachments.filter(d=>!batch.some(b=>b.id===d.id)).map(d=>d.id)];
    if(JSON.stringify(observed)!==JSON.stringify(expectedAttachmentIds))throw Error('Attachment parity mismatch: '+path);
    const datedIds=[...html.matchAll(/data-dated-document-id="([^"]+)" data-timeline-date="2026-11-04"/g)].map(m=>m[1]);
    if(JSON.stringify(datedIds)!==JSON.stringify(batch.map(d=>d.id)))throw Error('Dated batch parity mismatch: '+path);
    for(const d of batch)if(!html.includes('href="/ai-advocate-evidence-lab/'+esc(d.p)+'"'))throw Error('Missing dated batch link: '+path+' '+d.id);
    for(const d of attachments)if(!html.includes('href="/ai-advocate-evidence-lab/'+esc(d.public.pdf)+'"'))throw Error('Missing verified attachment link: '+path+' '+d.id);
    await writeFile(target,html,'utf8');
  }
  console.log('ATTACHMENT_SURFACES_OK: '+attachments.length+' verified attachments, six CZ/EN surfaces; standalone state counts unchanged');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await finalizeAttachmentSurfaces();

