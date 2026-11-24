import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const since='2026-05-01';
const begin='<!-- STATE-ATTACHMENTS:BEGIN -->';
const end='<!-- STATE-ATTACHMENTS:END -->';
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

export function renderAttachmentSurface(html,attachments,latestDecisionDate,lang,home){
  html=stripPanel(html);
  if(!attachments.length)return html;
  const panel=attachmentPanel(attachments,lang);
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
  const latestDecisionDate=documents.filter(d=>d.release_excluded!==true&&d.document_type==='state_record'&&d.issue_date>=since).map(d=>d.issue_date).sort().at(-1);
  if(!latestDecisionDate)throw Error('Missing standalone state record date');
  const surfaces=[['index.html','cs',true],['en.html','en',true],['kc/index.html','cs',true],['kc/en.html','en',true],['zpravy/04082026-010.html','cs',false],['news/04082026-010.html','en',false]];
  for(const [path,lang,home] of surfaces){
    const target=join(root,path);
    const html=renderAttachmentSurface(await readFile(target,'utf8'),attachments,latestDecisionDate,lang,home);
    const observed=[...html.matchAll(/data-attachment-id="([^"]+)"/g)].map(m=>m[1]);
    if(JSON.stringify(observed)!==JSON.stringify(attachments.map(d=>d.id)))throw Error('Attachment parity mismatch: '+path);
    for(const d of attachments)if(!html.includes('href="/ai-advocate-evidence-lab/'+esc(d.public.pdf)+'"'))throw Error('Missing verified attachment link: '+path+' '+d.id);
    await writeFile(target,html,'utf8');
  }
  console.log('ATTACHMENT_SURFACES_OK: '+attachments.length+' verified attachments, six CZ/EN surfaces; standalone state counts unchanged');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await finalizeAttachmentSurfaces();
