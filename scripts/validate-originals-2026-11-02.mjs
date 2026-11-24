import {verifyLateOriginal} from './late-original-public-provenance.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const fail=(msg)=>{throw Error('ORIGINAL-PDF-BATCH-2026-11-02: '+msg)};
const main=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-02-late-october.json','utf8')).documents;
const msp=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-10-30-kasace-msp.json','utf8')).documents;
const docs=[...main,...msp];
if(docs.length!==9||new Set(docs.map(x=>x.id)).size!==9)fail('seven unique source records required');
for(const d of docs){
 const p=d.public?.pdf;
 if(!p||!p.startsWith('documents/originaly-2026-11-02/'))fail('missing direct original PDF path: '+d.id);
 if(d.public.sha256!==d.public.source_original_sha256)fail('source hash mismatch in metadata: '+d.id);
 await verifyLateOriginal(d);
 const pdfInfo=execFileSync('pdfinfo',['web/'+p],{encoding:'utf8'});
 if(!new RegExp('Pages:\\s+'+d.public.source_original_page_count+'\\b').test(pdfInfo))fail('original page count differs: '+d.id);
 const page=await readFile('web/'+d.public.html,'utf8');
 const publicHref='/ai-advocate-evidence-lab/'+p;
 if(!page.includes(publicHref)||!page.includes('download'))fail('no active source link on evidence detail page: '+d.id);
 const text=page.toLowerCase();
 if(text.includes('binární soubor se nepodařilo ověřit')||text.includes('original binary pdf has not been uploaded'))fail('stale original-missing label on updated detail page: '+d.id);
}
const pageSet=['web/index.html','web/en.html','web/kc/index.html','web/kc/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
for(const name of pageSet){
 const page=await readFile(name,'utf8');
 for(const d of docs)if(!page.includes(d.id))fail('missing source in multilingual context: '+name+' '+d.id);
}
const packet=JSON.parse(await readFile('web/data/evidence-late-october-2026.json','utf8'));
if(packet.documents.length!==8||new Set(packet.documents.map(x=>x.id)).size!==8)fail('incomplete evidence PDF index');
for(const item of packet.documents){
 const doc=main.find(d=>d.id===item.id);if(!doc)fail('unexpected packet item '+item.id);
 const pin=await verifyLateOriginal(doc);
 const kind=pin.kind==='text_fallback'?'verified_public_text_copy':pin.kind==='redact'?'redacted_public_copy':'original';
 if(item.pdf_byte_identical!==(pin.kind==='original')||item.pdf_public_kind!==kind||item.source_sha256!==pin.source_sha256||item.public_sha256!==pin.public_sha256||item.pdf_url!=='/ai-advocate-evidence-lab/'+pin.path)fail('false or incomplete public provenance index '+item.id);
}
console.log('ORIGINAL PDF BATCH: verified 9/9 archived originals and independently pinned public copies, page counts, source links, eight index records, CZ/EN and Church pages');
