import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fail = msg => { throw new Error('RELEASE-2026-10-15: '+msg); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const docs=JSON.parse(await readFile('project-memory/documents-2026.json','utf8')).documents;
const slalom=JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));
const cases=JSON.parse(await readFile('project-memory/cases.json','utf8')).cases;
const cs=await readFile('web/zpravy/04082026-010.html','utf8');
const en=await readFile('web/news/04082026-010.html','utf8');

const eudaId='doc-eu-euda-2026-10-15-access-followup';
const ombId='doc-cz-dd-2026-10-15-eu-ombudsman-202602199-first-supplement';
const policeId='doc-cz-ekk-2026-10-15-pcr-krpo-krpt-gibs-infz-tp';

const euda=docs.find(x=>x.id===eudaId);
const omb=docs.find(x=>x.id===ombId);
const police=docs.find(x=>x.id===policeId);
for(const [name,item] of [['EUDA',euda],['ombudsman',omb],['police',police]]) if(!item) fail('chybí dokument '+name);

if(euda.submission_side!=='incoming_from_state_or_public_institution' || euda.justice_slalom) fail('EUDA 15. 10. musí být příchozí Godot, nikoli Slalom');
if(!cs.includes(`id="${eudaId}"`) || !en.includes(`id="en-${eudaId}"`)) fail('EUDA 15. 10. chybí v CZ/EN Godotu');
if(!cs.includes('před regulační lhůtou')) fail('CZ anotace EUDA neobsahuje podstatný stav');

for(const item of [omb,police]){
  if(item.submission_side!=='outgoing_from_user_or_alliance' || !item.justice_slalom) fail('vlastní podání musí být v Justičním slalomu');
  if(cs.includes(`id="${item.id}" data-state-love-id=`)) fail('vlastní podání nesmí být hlavním řádkem Godota');
}
if(omb.justice_slalom.archive_number!==150 || omb.justice_slalom.recipients.length!==6) fail('ombudsman: nesprávné číslo archivu nebo počet adresátů');
if(police.justice_slalom.archive_number!==149 || police.justice_slalom.recipients.length!==3) fail('policie: nesprávné číslo archivu nebo počet adresátů');

const ombRows=slalom.rows.filter(r=>r.document_id===ombId);
const policeRows=slalom.rows.filter(r=>r.document_id===policeId);
if(ombRows.length!==6 || policeRows.length!==3) fail('Justiční slalom neobsahuje všechny adresátské řádky');
for(const row of [...ombRows,...policeRows]) if(row.date!=='2026-10-15' || row.pdf_kind!=='redacted_original') fail('nový řádek má chybný datum nebo typ PDF');

const recipientExpectations=[
  [240,'CZ-PODANE-RUCE-VOBO','Mgr. Jindřich Vobořil, Ph.D.\nNárodní protidrogový koordinátor, celkem 10 let, 2x, naposledy 2024'],
  [239,'CZ-PAVEL-BEM','MUDr. Pavel Bém\nNárodní protidrogový koordinátor, celkem 5 let, 2x, naposledy 2026'],
  [238,'CZ-PODANE-RUCE-MRAV','Doc. MUDr. Viktor Mravčík, Ph.D.\nNárodní monitorovací středisko, celkem 20 let byl vedoucím NMS do roku 2021'],
  [237,'CZ-PSP-TROJANV','Poslanecká sněmovna – MVDr. Ing. Václav Trojan, Ph.D.\nDostupnost léčebného konopí a odklon od jeho kriminalizace, vedoucí pěstírny konopí MU/FNUSA']
];
for(const [number,id,label] of recipientExpectations){
  const row=slalom.rows.find(r=>r.number===number);
  if(!row || row.recipient_id!==id || row.recipient_cs!==label || row.role!=='copy') fail('nesprávný adresát/popisek řádku '+number);
}

for(const item of [euda,omb,police]){
  const rel=item.public?.pdf;
  if(!rel) fail('chybí veřejná PDF cesta '+item.id);
  const bytes=await readFile('web/'+rel);
  const digest=sha(bytes);
  if(digest!==item.public.sha256 || !bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-4096).toString('latin1').includes('%%EOF')) fail('PDF integrita '+item.id);
}
const policeBytes=await readFile('web/'+police.public.pdf);
const images=(policeBytes.toString('latin1').match(/\/Subtype\s*\/Image/g)||[]).length;
if(images<2) fail('policejní redigovaný originál neobsahuje dvě obrazové historické přílohy');

const scan1=await readFile('project-memory/historical-scans/2014/police-protection-request-2014-08-11-page-1.jpg');
const scan2=await readFile('project-memory/historical-scans/2014/police-protection-request-2014-08-11-page-2.jpg');
if(sha(scan1)!=='2154a033269f535d96bc298fb35f62c207fcd18ea26c3d9140dfbd02a0a7b8c8') fail('nesouhlasí scan 2014 strana 1');
if(sha(scan2)!=='44c3cf322dec551fe50bd45c0fd9d03b9f23ebff91a66cfb67acc55f17774966') fail('nesouhlasí scan 2014 strana 2');

const ombCase=cases.find(x=>x.id==='case-eu-omb-euda-thc-comparability-2026');
const eudaCase=cases.find(x=>x.id==='case-eu-euda-access-documents-thc-2026');
const krpoCase=cases.find(x=>x.id==='case-cz-pcr-krpo-100092-2026');
const gibsCase=cases.find(x=>x.id==='case-cz-gibs-3794-2026');
if(ombCase?.last_filing_document_id!==ombId || eudaCase?.latest_state_document_id!==eudaId || !krpoCase || !gibsCase) fail('procesní větve nejsou aktualizované');

console.log('Dávka 15. 10. 2026 OK: EUDA v Godotu, 9 adresátských řádků ve Slalomu, policejní redigovaný originál obsahuje 2stránkovou historickou žádost z 11. 8. 2014.');
