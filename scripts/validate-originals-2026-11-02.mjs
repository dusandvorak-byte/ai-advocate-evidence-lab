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
 const b=await readFile('web/'+p);
 if(b.length!==d.public.source_original_size_bytes||b.subarray(0,5).toString()!=='%PDF-'||!b.subarray(-4096).includes(Buffer.from('%%EOF')))fail('original structure or size failed: '+d.id);
 if(createHash('sha256').update(b).digest('hex')!==d.public.sha256)fail('SHA-256 differs from user-supplied original: '+d.id);
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
if(packet.documents.length!==8||packet.documents.some(x=>!x.pdf_byte_identical||!x.pdf_url))fail('incomplete evidence PDF index');
console.log('ORIGINAL PDF BATCH: verified 9/9 user-uploaded byte-identical original PDFs, page counts, source links, eight index records, CZ/EN and Church pages');
