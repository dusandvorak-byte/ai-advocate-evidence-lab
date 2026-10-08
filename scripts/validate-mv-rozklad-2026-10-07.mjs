import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fail=message=>{throw new Error(`MV-ROZKLAD-2026-10-07-GATE: ${message}`);};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const docId='doc-cz-mv-2026-10-07-mv-134798-4-so-2026';
const appealId='doc-cz-gfaa-2026-08-12-rozklad-mv-127234-2-obp-2026';
const initialId='doc-cz-mv-2026-08-11-mv-127234-2-obp-2026';
const timerId='timer-admin-mv-rozklad-127234-2026';
const originalSha='3309bb2da6053045d842ef2d9263dcdeab4fcce2d399264da08a7233f15b9366';
const originalSize=274596;
const pdfPath='documents/report-04082026-010/115-mv-134798-4-so-2026-2026-10-07.pdf';
const oldPdfPath='documents/report-04082026-010/115-mv-134798-4-so-2026-2026-10-07-verejna-textova-kopie.pdf';
const supplementPath='project-memory/documents-2026-supplement-2026-10-07-mv-rozklad.json';

const supplement=JSON.parse(await readFile(supplementPath,'utf8'));
const doc=(supplement.documents||[]).find(x=>x.id===docId);
if(!doc) fail('chybí kanonický záznam');
if(doc.issue_date!=='2026-10-07'||doc.reference!=='MV-134798-4/SO-2026'||doc.received_date!==null) fail('datum/reference/doručení jsou chybně');
if(doc.document_type!=='state_record'||doc.submission_side!=='incoming_from_state_or_public_institution') fail('listina není příchozí státní záznam');
if(doc.public?.source_original_sha256!==originalSha||doc.public?.source_original_size_bytes!==originalSize||doc.public?.source_original_page_count!==6) fail('provenience nahraného originálu nesouhlasí');
if(doc.public?.pdf!==pdfPath||doc.public?.intended_pdf!==pdfPath||doc.public?.sha256!==originalSha) fail('kanonický záznam neukazuje na byte-identický originál');
if(!String(doc.public?.verification_status||'').includes('source_pdf_received_binary_original')||String(doc.public?.verification_status||'').includes('not_byte_identical_original')) fail('stav provenance není binární originál');
for(const [type,target] of [['reakce_na',appealId],['navazuje_na',initialId],['resolves',appealId]]) if(!doc.relations?.some(r=>r.type===type&&r.target_id===target)) fail('chybí relace '+type+' -> '+target);

const parts=[
  'project-memory/binary-transport/2026-10-08/mv-134798-4-so-2026/part-001.xz.b64',
  'project-memory/binary-transport/2026-10-08/mv-134798-4-so-2026/part-002.xz.b64',
  'project-memory/binary-transport/2026-10-08/mv-134798-4-so-2026/part-003.xz.b64',
  'project-memory/binary-transport/2026-10-08/mv-134798-4-so-2026/part-004.xz.b64',
  'project-memory/binary-transport/2026-10-08/mv-134798-4-so-2026/part-005.xz.b64',
  'project-memory/binary-transport/2026-10-08/mv-134798-4-so-2026/part-006.xz.b64',
];
for(const part of parts) await access(part);

const bytes=await readFile('web/'+pdfPath);
if(bytes.length!==originalSize||!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||!bytes.subarray(-2048).toString('latin1').includes('%%EOF')||sha256(bytes)!==originalSha) fail('veřejný PDF není byte-identický s nahraným originálem');

const sources=JSON.parse(await readFile('project-memory/document-sources.json','utf8'));
if(!sources.sources?.some(s=>s.path===supplementPath&&s.role==='batch'&&s.batch_date==='2026-10-07')) fail('supplement není v manifestu');
const cases=JSON.parse(await readFile('project-memory/cases.json','utf8'));
const c=cases.cases?.find(x=>x.id==='case-cz-mv-infz-ganja-for-all-animals');
if(!c||c.status!=='remanded_for_new_proceeding'||c.decision_document_id!==docId||c.latest_state_document_id!==docId||c.last_remedy_document_id!==appealId) fail('procesní větev MV není správně aktualizována');

const generated=JSON.parse(await readFile('web/data/process-timers.json','utf8'));
if(generated.timers?.some(t=>t.id===timerId||t.source_document_id===appealId)) fail('vyřízený rozklad se znovu objevil jako aktivní interní časovač');
const processBuilder=await readFile('scripts/build-process-timers.mjs','utf8');
if(!processBuilder.includes('resolvedRemedyDocumentIds')||!processBuilder.includes("rel.type === 'resolves'")) fail('generátor nemá obecnou pojistku proti znovuvytvoření vyřízeného opravného prostředku');

const en=JSON.parse(await readFile('project-memory/english-godot-translations.json','utf8'));
if(!en.documents?.[docId]) fail('chybí anglický popis');
const cz=await readFile('web/zpravy/04082026-010.html','utf8');
const eh=await readFile('web/news/04082026-010.html','utf8');
if(!cz.includes(`<tr id="${docId}"`)||!eh.includes(`id="en-${docId}"`)) fail('CZ/EN Státu lásky čas neobsahuje nový řádek');
if(!cz.includes(pdfPath)||!eh.includes(pdfPath)) fail('CZ/EN řádek nemá odkaz na originální PDF');
if(cz.includes(oldPdfPath)||eh.includes(oldPdfPath)) fail('veřejné HTML stále odkazuje na starou textovou kopii');
const start=cz.indexOf(`<tr id="${docId}"`),end=start<0?-1:cz.indexOf('</tr>',start);
const row=start>=0&&end>=0?cz.slice(start,end+5):'';
if(!row.includes(`data-related-document-id="${appealId}"`)) fail('řádek neukazuje rozklad, na který ministr reagoval');
if(cz.includes(`data-timer-id="${timerId}"`)||eh.includes(`data-timer-id="${timerId}"`)) fail('zaniklý timer se vrátil do veřejného HTML');
console.log('MV-134798-4/SO-2026: byte-identický originál PDF, CZ/EN vazby a zánik rozkladového timeru jsou konzistentní.');
