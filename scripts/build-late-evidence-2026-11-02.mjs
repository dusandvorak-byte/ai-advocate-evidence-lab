import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const data=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-02-late-october.json','utf8'));
const okteAnnexes=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-05-okte-olomouc-attachments.json','utf8')).documents.sort((a,b)=>a.annex_index-b.annex_index);
if(okteAnnexes.length!==10||new Set(okteAnnexes.map(x=>x.reference)).size!==10)throw Error('Expected 10 distinct OKTE originals');
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const root='/ai-advocate-evidence-lab/';
const external='https://www.konopijelek.cz/novinky/trestni-podnet-a-zadost-ze-dne-28-rijna-2026/';
const short={
 nsz53:'Complete original 53-page complaints and specified criminal report, 28 October 2026. Delivery not established by publication.',
 nsz22:'Final original 22-page conditional NSZ intervention complaint dated 28 October 2026; court filing for 17 November is conditional, not yet evidenced.',
 ncoz:'Cassation complaint, case 18 A 17/2026, dated 30 October 2026. Full Czech-language text transcription, not the original PDF. Court receipt is unverified.',
 'ospro-nov1':'Urgent evidence supplement in criminal-reopening matters 15 Nt 3104/2026 and 15 Nt 3106/2026 dated 1 November 2026. Evidence annotation only, not a full original document.',
 krpm:'Original two-page Olomouc Regional Police response dated 30 October 2026. Its ten separately supplied historical OKTE expert-report PDF annexes are now linked below as byte-identical public originals, with SHA-256 provenance. The 2026 reply remains one incoming Godot record.',
 'nsz-short':'Two-page summary of correspondence with the Supreme Public Prosecutor dated 28 October 2026. Evidence annotation only. Full original is referenced at Konopí je lék.cz.',
 'ospro-3105':'District Court of Prostějov notice on case 15 Nt 3105/2026 dated 30 October 2026. Evidence annotation only; this is not a ruling in pending case 15 Nt 3106/2026.',
 'ospro-3103':'District Court of Prostějov notice on case 15 Nt 3103/2026 dated 30 October 2026. Full text transcription, not the original PDF; this is not a ruling in pending case 15 Nt 3104/2026.'
};
// Restore only the user's exact 53-page binary original, never a recreated PDF.
const nsz53Target='web/documents/originaly-2026-11-02/2026-10-28-nsz-specifikace-trestnich-podnetu-53-stran.pdf';
const nsz53Chunks=[
  'project-memory/binary-transport/nsz-2026-10-28-53-original/part-001.bin',
  'project-memory/binary-transport/nsz-2026-10-28-53-original/part-002.bin',
  'project-memory/binary-transport/nsz-2026-10-28-53-original/part-003.bin',
  'project-memory/binary-transport/nsz-2026-10-28-53-original/part-004.bin'
];
const nsz53ExpectedSha256='7d3fad3785d027fb5c5194e43a9d8f2b373891a76b342a5012548aa5b5ebde44';
const nsz53Parts=await Promise.all(nsz53Chunks.map(p=>readFile(p)));
const nsz53Bytes=Buffer.concat(nsz53Parts);
if(nsz53Bytes.length!==10143373||createHash('sha256').update(nsz53Bytes).digest('hex')!==nsz53ExpectedSha256||nsz53Bytes.subarray(0,5).toString()!=='%PDF-'||!nsz53Bytes.subarray(-4096).includes(Buffer.from('%%EOF'))) {
  throw Error('The original NSZ 53-page PDF failed byte-integrity validation');
}
await mkdir(dirname(nsz53Target),{recursive:true});
let nsz53Existing=null;
try {nsz53Existing=await readFile(nsz53Target)}catch(e){if(e.code!=='ENOENT')throw e}
if(nsz53Existing&&!nsz53Existing.equals(nsz53Bytes))throw Error('Existing NSZ PDF differs from the source original');
if(!nsz53Existing)await writeFile(nsz53Target,nsz53Bytes);
const all=[];
for (const doc of data.documents) {
 const key=basename(doc.public.html).replace('2026-11-02-evidence-','').replace('.html','');
 const path='project-memory/source-transcripts/2026-11-02-'+key+'-pages.json';
 let pages=null;try{pages=JSON.parse(await readFile(path,'utf8')).pages}catch(e){if(e.code!=='ENOENT')throw e}
 const full=Array.isArray(pages)&&pages.length===doc.public.source_original_page_count;
 const pdf=doc.public.pdf;
 if(!pdf||!doc.public.sha256||doc.public.sha256!==doc.public.source_original_sha256)throw Error('Original PDF not canonically linked: '+doc.id);
 const bytes=await readFile('web/'+pdf);
 const actual=createHash('sha256').update(bytes).digest('hex');
 if(actual!==doc.public.sha256||bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-4096).includes(Buffer.from('%%EOF')))throw Error('Original PDF source/byte integrity failed: '+doc.id);
 const pdfUrl=root+pdf;
 const subtitle=full?'Úplný textový přepis a ověřený původní PDF soubor.':'Evidenční anotace a ověřený původní PDF soubor; nikoli úplný textový přepis.';
 const sections=full?pages.map((p,i)=>'<section class="record-page"><h2>Strana '+(i+1)+' z '+pages.length+'</h2><pre>'+esc(p)+'</pre></section>').join('\n'):'<section class="record-page"><h2>Popis evidované listiny</h2><p>'+esc(doc.evidence_note)+'</p></section>';
 const link=key==='nsz-short'?'<p><a href="'+external+'">Originál úplného podání na webu Konopí je lék.cz – odkaz uvedený autorem</a></p>':'';
 const pdfLink='<p><a href="'+pdfUrl+'" download>Původní dokument PDF – otevřít nebo stáhnout</a></p>';
 const annexBlock=key==='krpm'?'<section class="record-page" id="okte-originaly"><h2>Deset původních odborných vyjádření OKTE – přílohy odpovědi policie 30. 10. 2026</h2><p>Policejní odpověď č. j. KRPM-145410-2/ČJ-2026-1400AP-106 uvádí 10 souborových příloh. Níže jsou všechny původní úřední PDF, samostatně a v binárně shodné podobě se soubory předanými policií. Datum u každé přílohy je datum vyjádření, nikoli datum policejní odpovědi.</p><ol>'+okteAnnexes.map(a=>'<li><a href="'+root+esc(a.public.pdf)+'" download>Úroda '+esc(a.harvest_label)+' – '+esc(a.reference)+'</a> · '+esc(a.issue_date)+' · '+a.public.source_original_page_count+' stran · SHA-256 <code>'+esc(a.public.sha256)+'</code></li>').join('')+'</ol><p><a href="'+root+'documents/2026-11-04/2026-11-03-okte-srovnavaci-analyza-redigovany-original.pdf">40stránková autorská srovnávací analýza</a> – komentář k deseti originálům, nikoli další policejní vyjádření.</p><p lang="en">Ten original expert reports received as annexes to one 30 October 2026 Olomouc Police reply; each source PDF retains its exact original SHA-256.</p></section>':'';

 const html='<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="'+root+'brand.css"><title>'+esc(doc.user_title)+' – Evidence Lab</title><style>body{font:17px/1.6 system-ui,sans-serif;background:#eef3f5;color:#193448;margin:0}header,main,footer{max-width:1020px;margin:auto;padding:1.2rem}header{background:#fff;border-bottom:4px solid #24688c}a{color:#195b82}h1{line-height:1.25;font-size:clamp(1.5rem,3vw,2.25rem)}.meta{background:#fff;padding:1rem 1.4rem}.record-page{margin:1rem 0;padding:1.2rem;background:#fff;border-radius:5px}.record-page h2{font-size:1.1rem}.record-page pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.56 ui-monospace,SFMono-Regular,monospace}@media(max-width:500px){.record-page pre{font-size:11px}.record-page{padding:.6rem}}@media print{.record-page{break-after:page}}</style></head><body><header><nav><a href="'+root+'index.html">CannaInsider CZ</a> · <a href="'+root+'en.html" lang="en">English</a> · <a href="'+root+'kc/index.html">Konopná církev</a></nav><h1>'+esc(doc.user_title)+'</h1><p>'+esc(doc.issue_date)+' · '+esc(doc.institution_id)+' · '+esc(doc.reference)+'</p></header><main><div class="meta"><strong>'+subtitle+'</strong><p lang="en">'+esc(short[key])+' Original binary PDF is linked below and its SHA-256 matches the uploaded source.</p><p><strong>Ověřený SHA-256 dodaného původního PDF:</strong> <code>'+esc(doc.public.source_original_sha256)+'</code></p><p>Rozsah původní listiny: '+doc.public.source_original_page_count+' stran. Původní PDF soubor je veřejně dostupný a jeho SHA-256 souhlasí s dodanou listinou. Evidence není důkazem doručení soudu či orgánu.</p>'+pdfLink+link+'</div>'+annexBlock+sections+'</main><footer>Evidence Lab · rozlišení originálu, přepisu a evidenčního záznamu</footer></body></html>';
 if(full)for(const p of pages)if(!html.includes(esc(p)))throw Error('Missing text from '+key);
 await mkdir(dirname('web/'+doc.public.html),{recursive:true});await writeFile('web/'+doc.public.html,html,'utf8');
 all.push({id:doc.id,href:root+doc.public.html,date:doc.issue_date,reference:doc.reference,title_cs:doc.user_title,title_en:short[key],public_kind:full?'complete_text_transcript':'evidence_annotation',source_sha256:doc.public.source_original_sha256,pdf_url:pdfUrl,pdf_byte_identical:true,pages:doc.public.source_original_page_count});
}
await writeFile('web/data/evidence-late-october-2026.json',JSON.stringify({schema_version:'1.0',documents:all},null,2)+'\n');
console.log('LATE EVIDENCE',all.length,'records',all.filter(x=>x.public_kind==='complete_text_transcript').length,'complete text transcriptions');
