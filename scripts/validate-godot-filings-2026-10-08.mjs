import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fail=message=>{throw new Error('GODOT-SLALOM-2026-10-08: '+message);};
const must=(condition,message)=>{if(!condition) fail(message);};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));

const batchPath='project-memory/documents-2026-supplement-2026-10-08-godot-filings.json';
const d6='doc-cz-dd-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni';
const d8='doc-cz-ekk-dd-2026-10-08-kpr-nsz-msp-pp-mv-ospro-dukazni-doplneni';
const omb='doc-eu-omb-2026-10-07-202602199-registration';
const ms13='doc-cz-ms-pha-2026-10-06-15-ad-14-2026-13';
const ms17='doc-cz-ms-pha-2026-10-07-15-ad-14-2026-17';
const suit='doc-cs-dd-2026-08-31-slalom-augsep-043';
const complaint='doc-cz-citc-2026-10-06-eu-ombudsman-euda-form-59936';

const expected=new Map([
 [d6,{side:'outgoing',date:'2026-10-06',pdf:'documents/justice-slalom/2026-10/099-podani-2026-10-06-nsz-vsz.pdf',sha:'c831604cc60860d0dee289ea4a39bb61aa5a006f720ad975bcf1ef590fb9c0a7',size:86287,pages:5,rows:3}],
 [d8,{side:'outgoing',date:'2026-10-08',pdf:'documents/justice-slalom/2026-10/100-podani-2026-10-08-kpr-nsz-msp-ppr-mv-ospro.pdf',sha:'9490a2cde83d76ec9b9fcf838df622e706725de651ed3b807a46e0f3b57fcda3',size:156145,pages:9,rows:6}],
 [omb,{side:'incoming',date:'2026-10-07',pdf:'documents/report-04082026-010/116-eu-ombudsman-202602199-2026-10-07.pdf',sha:'8da9712f3ea540ce2b5f6364175b06eb9e95dfa826506f7be758d998ab9fcdc2',size:53281,pages:2}],
 [ms13,{side:'incoming',date:'2026-10-06',pdf:'documents/report-04082026-010/117-ms-praha-15-ad-14-2026-13-2026-10-06.pdf',sha:'25ecfff3def2fe8b328cc90bf970801b2778038befb9e0330e6abeb968c1a2c8',size:181141,pages:4}],
 [ms17,{side:'incoming',date:'2026-10-07',pdf:'documents/report-04082026-010/118-ms-praha-15-ad-14-2026-17-2026-10-07.pdf',sha:'72c6162e095559546988d4f8b0e2423a486d6213c4881fb2b240b44fd5275383',size:109261,pages:1}],
]);

const source=await readJson(batchPath);
must(source.documents?.length===5,'release packet musí obsahovat 5 dokumentů');
const packet=new Map(source.documents.map(x=>[x.id,x]));
for(const [id,spec] of expected){
 const d=packet.get(id); must(d,'chybí '+id);
 must(d.issue_date===spec.date,'chybné issue_date '+id);
 must(d.public?.pdf===spec.pdf&&d.public?.intended_pdf===spec.pdf,'chybné PDF path '+id);
 must(d.public?.sha256===spec.sha&&d.public?.source_original_sha256===spec.sha,'SHA provenance nesouhlasí '+id);
 must(d.public?.source_original_size_bytes===spec.size&&d.public?.source_original_page_count===spec.pages,'source metadata nesouhlasí '+id);
 must(String(d.public?.verification_status||'').includes('source_pdf_received_binary_original'),'není deklarován binární originál '+id);
 const bytes=await readFile('web/'+spec.pdf);
 must(bytes.length===spec.size&&bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(-2048).toString('latin1').includes('%%EOF'),'neplatný veřejný PDF '+id);
 must(sha256(bytes)===spec.sha,'veřejný PDF není byte-identický '+id);
 if(spec.side==='outgoing'){
   must(d.document_type==='user_submission'&&d.submission_side==='outgoing_from_user_or_alliance','vlastní podání má chybnou klasifikaci '+id);
   must(d.justice_slalom&&d.justice_slalom.recipients?.length===spec.rows,'vlastní podání nemá správné Slalom metadata '+id);
 }else{
   must(d.document_type==='state_record'&&d.submission_side==='incoming_from_state_or_public_institution','státní listina má chybnou klasifikaci '+id);
   must(!d.justice_slalom,'státní listina nesmí být Justiční slalom '+id);
 }
}

must(packet.get(omb).received_date==='2026-10-07'&&packet.get(omb).reference==='202602199','ombudsman registrace datum/reference nesouhlasí');
must(packet.get(ms13).received_date===null&&packet.get(ms13).reference==='15 Ad 14/2026-13','MS -13 datum/reference/doručení nesouhlasí');
must(packet.get(ms17).received_date===null&&packet.get(ms17).reference==='15 Ad 14/2026-17','MS -17 datum/reference/doručení nesouhlasí');
must(packet.get(omb).relations?.some(r=>r.type==='reakce_na'&&r.target_id===complaint),'ombudsman není napojen na stížnost 6. 10.');
for(const id of [ms13,ms17]) must(packet.get(id).relations?.some(r=>r.type==='reakce_na'&&r.target_id===suit),id+' není napojen na žalobu 31. 8.');

const canonical=await readJson('project-memory/documents-2026.json');
const docs=new Map(canonical.documents.map(x=>[x.id,x]));
for(const id of expected.keys()) must(docs.has(id),'kanonický registr po buildu postrádá '+id);

const slalom=await readJson('web/data/justice-slalom.json');
const rows=slalom.rows||[];
for(const id of [d6,d8]){
 const spec=expected.get(id), rr=rows.filter(r=>r.document_id===id);
 must(rr.length===spec.rows,`Justiční slalom má pro ${id} ${rr.length} řádků místo ${spec.rows}`);
 must(rr.every(r=>r.pdf===spec.pdf&&r.pdf_kind==='original'),'Slalom neodkazuje na originální PDF '+id);
}
for(const id of [omb,ms13,ms17]) must(!rows.some(r=>r.document_id===id),'státní listina se chybně objevila ve Slalomu '+id);

const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');
const table=(html,id)=>{
 const s=html.indexOf(`<table id="${id}"`),e=s<0?-1:html.indexOf('</table>',s);
 must(s>=0&&e>=0,'chybí tabulka '+id);
 return html.slice(s,e+8);
};
const czt=table(cz,'chronologie-seznam'),ent=table(en,'en-chronology-list');
for(const id of [omb,ms13,ms17]){
 must(czt.includes(`<tr id="${id}"`),'CZ Godot nemá hlavní řádek '+id);
 must(ent.includes(`<tr id="en-${id}"`),'EN Godot nemá hlavní řádek '+id);
 must(czt.includes(expected.get(id).pdf)&&ent.includes(expected.get(id).pdf),'CZ/EN Godot nemá PDF '+id);
}
for(const id of [d6,d8]){
 must(!czt.includes(`<tr id="${id}"`),'vlastní podání je chybně hlavní řádek Godota '+id);
 must(!ent.includes(`<tr id="en-${id}"`),'EN vlastní podání je chybně hlavní řádek '+id);
}
const row=(html,id,prefix='')=>{
 const needle=`<tr id="${prefix}${id}"`;
 const s=html.indexOf(needle),e=s<0?-1:html.indexOf('</tr>',s);
 must(s>=0&&e>=0,'chybí řádek '+prefix+id);
 return html.slice(s,e+5);
};
must(row(czt,omb).includes(`data-related-document-id="${complaint}"`),'ombudsman řádek neukazuje stížnost 6. 10.');
for(const id of [ms13,ms17]) must(row(czt,id).includes(`data-related-document-id="${suit}"`),id+' neukazuje žalobu 31. 8.');
must(czt.includes(`data-related-document-id="${d6}"`)&&czt.includes(`data-related-document-id="${d8}"`),'Godot nezachoval vlastní podání ve vztahových sloupcích');
must(en.includes(`data-related-document-id="${d6}"`)&&en.includes(`data-related-document-id="${d8}"`),'EN Godot nezachoval vztahovou paritu');

const cases=await readJson('project-memory/cases.json');
const cm=new Map(cases.cases.map(x=>[x.id,x]));
const ombCase=cm.get('case-eu-omb-euda-thc-comparability-2026');
must(ombCase?.reference==='202602199'&&ombCase?.latest_state_document_id===omb&&ombCase?.latest_state_on==='2026-10-07','Ombudsman case není posunut na registraci 202602199');
const c15=cm.get('case-cz-ms-praha-15-ad-14-2026');
must(c15?.decision_document_id===ms13&&c15?.latest_state_document_id===ms17&&c15?.decided_on==='2026-10-06','15 Ad 14/2026 case není aktualizován');

const translations=await readJson('project-memory/english-godot-translations.json');
for(const id of expected.keys()) must(Boolean(translations.documents?.[id]),'chybí EN anotace '+id);

console.log('GODOT/SLALOM 8. 10. OK: státní listiny jsou hlavní řádky Godota; vlastní podání 6. a 8. 10. jsou v Justičním slalomu a jen vztahově v Godotu; všech 5 PDF je byte-identických s originály.');
