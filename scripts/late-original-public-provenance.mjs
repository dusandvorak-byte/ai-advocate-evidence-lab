import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {indexJusticeSlalomHardeningEvidence,policyHardenedCopyOk} from './justice-slalom-pdf-provenance.mjs';

const json=async path=>JSON.parse(await readFile(path,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const fail=(id,msg)=>{throw Error('LATE-ORIGINAL-PROVENANCE '+id+': '+msg)};
const require=(ok,id,msg)=>{if(!ok)fail(id,msg)};
const pdfMatches=(bytes,digest,size)=>Buffer.isBuffer(bytes)&&bytes.length===size&&bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(-4096).includes(Buffer.from('%%EOF'))&&sha(bytes)===digest;
const identityMatches=(d,p)=>d?.id===p.id&&d.release_excluded!==true&&d.public?.pdf===p.path&&d.public.source_original_sha256===p.source_sha256&&d.public.source_original_size_bytes===p.source_size&&d.public.source_original_page_count===p.pages;

export function verifyPinnedLatePair({pin:p,original,publicCopy,sourceRecord,finalRecords,hardeningById,hardeningReportOk}){
 const id=p.id;
 require(identityMatches(sourceRecord,p)&&sourceRecord.public.sha256===p.source_sha256,id,'archival source metadata mismatch');
 require(pdfMatches(original,p.source_sha256,p.source_size),id,'archival source bytes mismatch');
 require(pdfMatches(publicCopy,p.public_sha256,p.public_size)&&blob(publicCopy)===p.public_git_blob,id,'pinned public bytes mismatch');
 require(hardeningReportOk===true,id,'authenticated clean hardening report missing');
 require(Array.isArray(finalRecords)&&finalRecords.length===2&&finalRecords.every(d=>identityMatches(d,p)&&d.public.sha256===p.public_sha256),id,'final canonical/public registry mismatch');
 const row=hardeningById.get(id);
 if(p.kind==='original'){
  require(p.source_sha256===p.public_sha256&&original.equals(publicCopy)&&(!row||row.changed===false),id,'claimed original is not source-identical');
 }else{
  require(p.source_sha256!==p.public_sha256&&finalRecords.every(doc=>policyHardenedCopyOk({doc,digest:p.public_sha256,expectedInputSha:p.source_sha256,hardeningById,hardeningReportOk})),id,'authenticated source to public digest transition missing');
  require(row.registered===true&&row.page_count===p.pages,id,'hardening row page count/registration mismatch');
  if(p.kind==='redact'){
   require(row.strategy==='redact'&&row.text_fallback==null&&Array.isArray(row.redaction_matches)&&row.redaction_matches.length>0&&row.redaction_matches.every(m=>Number.isInteger(m.page)&&m.page>=1&&m.page<=p.pages&&typeof m.rule==='string'&&m.rule.length),id,'redaction evidence mismatch');
  }else if(p.kind==='text_fallback'){
   const f=row.text_fallback;
   require(row.strategy==='pymupdf_rewrite+text_fallback'&&f&&f.source_sha256===p.source_sha256&&f.output_sha256===p.public_sha256&&f.fallback_input_sha256===p.fallback_input_sha256&&f.source_page_count===p.pages&&f.output_page_count===p.pages&&f.nonempty_page_count===p.pages&&f.fallback_input_page_count===p.pages&&f.deterministic===true&&f.output_text_verified===true&&f.poppler_ok===true&&String(finalRecords[0].public.verification_status).includes('not_byte_identical_original')&&String(finalRecords[1].public.verification_status).includes('not_byte_identical_original'),id,'pinned text fallback evidence mismatch');
  }else fail(id,'unapproved derivative kind');
 }
 return true;
}

let ctx;
async function load(){
 const contract=await json('project-memory/private-redaction-policy-contract.json');
 const report=await json('project-memory/privacy-hardening-report.json');
 if(contract.status!=='binding'||!/^[a-f0-9]{64}$/.test(contract.approved_policy_hmac||'')||report.schema_version!=='1.2'||report.policy_file!=='scripts/publication_redaction.py'||report.policy_sha256!==sha(await readFile(report.policy_file)))throw Error('LATE-ORIGINAL-PROVENANCE: policy/report binding mismatch');
 const evidence=indexJusticeSlalomHardeningEvidence(report,{expectedAuthenticatedPolicyIdentity:contract.approved_policy_hmac});
 if(!evidence.hardeningReportOk)throw Error('LATE-ORIGINAL-PROVENANCE: authenticated hardening report is not clean');
 const data=await json('project-memory/late-original-public-pins-2026-11-24.json');
 if(data.records.length!==31||new Set(data.records.map(p=>p.id)).size!==31)throw Error('LATE-ORIGINAL-PROVENANCE: frozen pin set invalid');
 return {pins:new Map(data.records.map(p=>[p.id,p])),registries:await Promise.all(['project-memory/documents-2026.json','web/data/documents-2026.json'].map(json)),...evidence};
}
const context=()=>ctx??=load();
const verifyPages=(bytes,p,label)=>{
 const info=execFileSync('pdfinfo',['-'],{input:bytes,encoding:'utf8',maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']});
 require(new RegExp('Pages:\\s+'+p.pages+'\\b').test(info),p.id,label+' page count mismatch');
};
const cache=new Map();
export async function verifyLateOriginal(sourceRecord){
 const c=await context();
 const p=c.pins.get(sourceRecord?.id);
 if(!p)fail(sourceRecord?.id,'no independently pinned original/public pair');
 // Always verify the passed archival record, even on cached file validation.
 require(identityMatches(sourceRecord,p)&&sourceRecord.public.sha256===p.source_sha256,p.id,'source record changed');
 if(!cache.has(p.id))cache.set(p.id,(async()=>{
  let original;
  if(p.kind==='text_fallback'){
   require(p.id==='doc-cz-dd-2026-10-28-nsz-53str-specifikace-a-reakce'&&p.source_git_blob===null,p.id,'unexpected transported source');
   original=Buffer.concat(await Promise.all([1,2,3,4].map(i=>readFile('project-memory/binary-transport/nsz-2026-10-28-53-original/part-00'+i+'.bin'))));
  }else{
   const indexed=execFileSync('git',['rev-parse',':web/'+p.path],{encoding:'utf8'}).trim();
   require(indexed===p.source_git_blob,p.id,'archival Git blob changed');
   original=execFileSync('git',['cat-file','blob',indexed],{maxBuffer:Math.max(p.source_size+65536,2*1024*1024)});
  }
  const publicCopy=await readFile('web/'+p.path);
  const finalRecords=c.registries.map(reg=>{
   const rows=reg.documents.filter(d=>d.id===p.id);
   require(rows.length===1,p.id,'missing or duplicated final registry identity');
   return rows[0];
  });
  verifyPinnedLatePair({pin:p,original,publicCopy,sourceRecord,finalRecords,...c});
  verifyPages(original,p,'archived source');
  verifyPages(publicCopy,p,'public copy');
  return p;
 })());
 return cache.get(p.id);
}

export async function finalizeLateEvidencePublicLabels(){
 const c=await context();
 const path='web/data/evidence-late-october-2026.json';
 const packet=await json(path);
 const pins=[...c.pins.values()].filter(p=>p.path.startsWith('documents/originaly-2026-11-02/'));
 require(pins.length===9&&packet.documents.length===8&&new Set(packet.documents.map(d=>d.id)).size===8,'late-october','packet identity/count mismatch');
 for(const p of pins){
  const source=await json(p.source_manifest);
  const doc=source.documents.find(d=>d.id===p.id);
  await verifyLateOriginal(doc);
  const item=packet.documents.find(d=>d.id===p.id);
  if(p.id!=='doc-cz-dd-2026-10-30-kasacni-msp-18a23'){
   require(item&&item.source_sha256===p.source_sha256&&item.pdf_url==='/ai-advocate-evidence-lab/'+p.path,'late-october','packet source identity mismatch '+p.id);
   item.pdf_byte_identical=p.kind==='original';
   item.pdf_public_kind=p.kind==='text_fallback'?'verified_public_text_copy':p.kind==='redact'?'redacted_public_copy':'original';
   item.public_sha256=p.public_sha256;
  }
  if(p.kind==='original')continue;
  const file='web/'+doc.public.html;
  let html=await readFile(file,'utf8');
  const textCopy=p.kind==='text_fallback';
  const label=textCopy?'Ověřená veřejná textová kopie PDF (bez původních obrazových příloh)':'Ověřená redigovaná veřejná kopie PDF';
  const en=textCopy?'Verified public text copy (not the binary original; original image attachments are not reproduced)':'Verified redacted public PDF copy (not the binary original)';
  html=html.replaceAll('ověřený původní PDF soubor','ověřená veřejná kopie PDF')
   .replaceAll('a jeho původní PDF soubor','a jeho ověřená veřejná kopie PDF')
   .replaceAll('Original binary PDF is linked below and its SHA-256 matches the uploaded source.',en+'. The archived source has a separate SHA-256.')
   .replaceAll('Původní PDF soubor je veřejně dostupný a jeho SHA-256 souhlasí s dodanou listinou.',label+'. Archivní originál má odlišný kontrolní otisk.')
   .replaceAll('Původní PDF je veřejně přístupné v původní podobě.','Veřejně přístupná je ověřená redigovaná kopie PDF.')
   .replaceAll('Původní PDF je veřejně přístupné.','Veřejně přístupná je ověřená redigovaná kopie PDF.')
   .replaceAll('Original PDF SHA-256:','Archived original PDF SHA-256:')
   .replaceAll('Full Czech-language text transcription and the byte-identical original PDF are linked here.','Full Czech-language text transcription and a verified redacted public PDF copy are linked here.')
   .replaceAll('PDF je sestaveno z kontrolovaných binárních částí do bitově shodného originálu.','Archivní originál je sestaven z kontrolovaných binárních částí; odkaz vede na ověřenou veřejnou textovou kopii.');
  const href='/ai-advocate-evidence-lab/'+p.path;
  const anchor='<a href="'+href+'" download>';
  require(html.includes(anchor),p.id,'detail download link absent');
  html=html.replace(/<!-- LATE-PDF-PROVENANCE:BEGIN -->[\s\S]*?<!-- LATE-PDF-PROVENANCE:END -->/g,'');
  const pos=html.indexOf(anchor);
  const end=html.indexOf('</a>',pos);
  require(end>pos,p.id,'detail download anchor incomplete');
  html=html.slice(0,pos)+anchor+label+html.slice(end);
  const insert=html.indexOf('</p>',pos);
  require(insert>pos,p.id,'detail PDF paragraph incomplete');
  const info='<!-- LATE-PDF-PROVENANCE:BEGIN --><p><strong>SHA-256 veřejné kopie / public copy:</strong> <code>'+p.public_sha256+'</code></p><p lang="en">'+en+'.</p><!-- LATE-PDF-PROVENANCE:END -->';
  html=html.slice(0,insert+4)+info+html.slice(insert+4);
  await writeFile(file,html,'utf8');
 }
 await writeFile(path,JSON.stringify(packet,null,2)+'\n','utf8');
 console.log('LATE_EVIDENCE_PUBLIC_PROVENANCE_OK: nine archived original/public pairs; eight index entries; distinct truthful public labels');
}

