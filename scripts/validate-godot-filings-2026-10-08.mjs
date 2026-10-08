import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fail = message => { throw new Error('GODOT-2026-10-06-08: ' + message); };
const must = (condition, message) => { if (!condition) fail(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path,'utf8'));

const batchPath='project-memory/documents-2026-supplement-2026-10-08-godot-filings.json';
const d6='doc-cz-dd-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni';
const d8='doc-cz-ekk-dd-2026-10-08-kpr-nsz-msp-pp-mv-ospro-dukazni-doplneni';
const ms='doc-cz-msz-pha-2026-10-01-3-kzn-974-2026-114';
const kzt='doc-cz-ksz-brn-2026-09-16-1-kzt-475-2026-71';
const kzn='doc-cz-ksz-brn-2026-10-01-1-kzn-1079-2026-41';
const ppr='doc-cz-pcr-pp-2026-10-07-ppr-52605-2-cj-2026-990210-pd';
const pdf6='documents/report-04082026-010/116-dd-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni-verejna-textova-kopie.pdf';
const pdf8='documents/report-04082026-010/117-ekk-dd-2026-10-08-dukazni-doplneni-verejna-textova-kopie.pdf';

const source=await readJson(batchPath);
must(source.documents?.length===2,'release packet musí obsahovat právě dvě podání');
const packet=new Map(source.documents.map(x=>[x.id,x]));
const a=packet.get(d6), b=packet.get(d8);
must(a&&b,'chybí jedno z obou podání v release packetu');
must(a.issue_date==='2026-10-06'&&a.received_date===null,'podání 6. 10. má chybné datum nebo vymyšlené doručení');
must(b.issue_date==='2026-10-08'&&b.received_date===null,'podání 8. 10. má chybné datum nebo vymyšlené doručení');
for(const d of [a,b]){
  must(d.document_type==='user_submission'&&d.submission_side==='outgoing_from_user_or_alliance','oba dokumenty musí zůstat vlastními podáními');
  must(!d.justice_slalom,'uživatel změnil pokyn: dokument nesmí dostat metadata Justičního slalomu');
  must(String(d.public?.verification_status||'').includes('not_byte_identical_original'),'veřejná PDF provenance musí pravdivě uvádět textovou kopii');
  must(String(d.public?.verification_status||'').includes('complete_extracted_text'),'veřejná kopie musí být z úplného extrahovaného textu');
}
must(a.public?.source_original_sha256==='c831604cc60860d0dee289ea4a39bb61aa5a006f720ad975bcf1ef590fb9c0a7'&&a.public?.source_original_size_bytes===86287&&a.public?.source_original_page_count===5,'provenience originálu 6. 10. nesouhlasí');
must(b.public?.source_original_sha256==='9490a2cde83d76ec9b9fcf838df622e706725de651ed3b807a46e0f3b57fcda3'&&b.public?.source_original_size_bytes===156145&&b.public?.source_original_page_count===9,'provenience originálu 8. 10. nesouhlasí');
must(a.public?.pdf===pdf6&&b.public?.pdf===pdf8,'veřejná PDF nejsou materializována na schválené cesty');
for(const d of [a,b]){
  const bytes=await readFile('web/'+d.public.pdf);
  must(bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(-2048).toString('latin1').includes('%%EOF')&&bytes.length>4000,'neplatné veřejné PDF '+d.id);
  must(sha256(bytes)===d.public.sha256,'SHA veřejného PDF nesouhlasí '+d.id);
  must(d.public.sha256!==d.public.source_original_sha256,'textová kopie nesmí být mylně deklarována jako byte-identický originál '+d.id);
}

const canonical=await readJson('project-memory/documents-2026.json');
const docs=new Map(canonical.documents.map(x=>[x.id,x]));
for(const id of [d6,d8]) must(docs.has(id),'kanonický registr po buildu postrádá '+id);
must(docs.get(d6).relations?.some(r=>r.type==='reakce_na'&&r.target_id===ms),'podání 6. 10. není napojeno na MSZ Praha 3 KZN 974/2026-114');
for(const target of [kzt,ms,kzn,ppr]) must(docs.get(d8).relations?.some(r=>r.type==='reakce_na'&&r.target_id===target),'podání 8. 10. není napojeno na '+target);

const sources=await readJson('project-memory/document-sources.json');
must(sources.sources?.some(x=>x.path===batchPath&&x.role==='batch'&&x.batch_date==='2026-10-08'),'release packet není v document-sources');
const translations=await readJson('project-memory/english-godot-translations.json');
must(Boolean(translations.documents?.[d6])&&Boolean(translations.documents?.[d8]),'chybí anglická parita anotací');

const slalom=await readJson('web/data/justice-slalom.json');
must(!slalom.rows?.some(r=>r.document_id===d6||r.document_id===d8),'oba dokumenty mají být v Godotu, ne v Justičním slalomu');

const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');
const table=(html,id)=>{
  const s=html.indexOf(`<table id="${id}"`), e=s<0?-1:html.indexOf('</table>',s);
  must(s>=0&&e>=0,'chybí tabulka '+id);
  return html.slice(s,e+8);
};
const czt=table(cz,'chronologie-seznam'), ent=table(en,'en-chronology-list');
must(!czt.includes(`<tr id="${d6}"`)&&!czt.includes(`<tr id="${d8}"`),'vlastní podání nesmějí být hlavní řádky Státu lásky čas');
must(!ent.includes(`<tr id="en-${d6}"`)&&!ent.includes(`<tr id="en-${d8}"`),'EN vlastní podání nesmějí být hlavní řádky');

const row=(html,id,prefix='')=>{
  const needle=`<tr id="${prefix}${id}"`;
  const s=html.indexOf(needle), e=s<0?-1:html.indexOf('</tr>',s);
  must(s>=0&&e>=0,'chybí státní řádek '+prefix+id);
  return html.slice(s,e+5);
};
const msRow=row(czt,ms), kztRow=row(czt,kzt), kznRow=row(czt,kzn), pprRow=row(czt,ppr);
must(msRow.includes(`data-related-document-id="${d6}"`),'podání 6. 10. není viditelné v Godotu u MSZ Praha');
for(const [name,r] of [['KSZ 1 KZT',kztRow],['MSZ Praha',msRow],['KSZ 1 KZN',kznRow],['Policejní prezidium',pprRow]]) must(r.includes(`data-related-document-id="${d8}"`),'podání 8. 10. není viditelné v Godotu u '+name);
must(czt.includes(pdf6)&&czt.includes(pdf8),'CZ Godot nemá aktivní PDF odkazy obou podání');
must(ent.includes(pdf6)&&ent.includes(pdf8),'EN Godot nemá aktivní PDF odkazy obou podání');
must(ent.includes(`data-related-document-id="${d6}"`)&&ent.includes(`data-related-document-id="${d8}"`),'EN Godot nemá vztahovou paritu obou podání');

const cases=await readJson('project-memory/cases.json');
const cm=new Map(cases.cases.map(x=>[x.id,x]));
for(const id of ['CASE-CZ-VSZ-PHA-1VZN1678-2026','CASE-CZ-VSZ-OLO-3VZN239-2026']){
  must(cm.get(id)?.last_filing_on==='2026-10-06'&&cm.get(id)?.last_filing_document_id===d6,id+' není posunut na podání 6. 10.');
}
for(const id of ['CASE-CZ-NSZ-6NZN1737-2026','case-cz-ms-praha-18a23-2026','case-cz-ms-praha-18a17-2026','case-cz-ms-praha-15a44-2026','case-cz-os-pro-2t104-2010-obnova','case-cz-os-pro-2t65-2011-obnova','case-cz-pcr-ku-interni-prezkum']){
  must(cm.get(id)?.last_filing_on==='2026-10-08'&&cm.get(id)?.last_filing_document_id===d8,id+' není posunut na podání 8. 10.');
}
must(cm.get('CASE-CZ-NSZ-6NZN1737-2026')?.related_document_ids?.includes(d6),'NSZ genealogie nezachovala i podání 6. 10.');

console.log('GODOT 6+8/10 OK: obě vlastní podání jsou jen ve vztahových sloupcích Godota, mají CZ/EN paritu a validní veřejná PDF; Justiční slalom je neobsahuje.');
