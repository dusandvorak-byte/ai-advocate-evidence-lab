import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fail = message => { throw new Error(`EKK-2026-10-02-GATE: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const registry = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-10-02-ekk-os-pro.json','utf8'));
const mainId = 'doc-cz-ekk-2026-10-02-os-pro-procesni-dukazni-navrh';
const annexId = 'doc-cz-ekk-2026-10-02-dukazni-chronologie-kjl-2008-2026';
const main = registry.documents?.find(x=>x.id===mainId);
const annex = registry.documents?.find(x=>x.id===annexId);
if (!main || !annex) fail('chybí hlavní podání nebo důkazní příloha');
if (main.issue_date !== '2026-10-02' || main.institution_id !== 'CZ-EKK' || main.document_type !== 'user_submission') fail('hlavní podání má nesprávná kanonická metadata');
if (main.received_date !== null) fail('datum doručení bylo doplněno bez primárního důkazu');
if (JSON.stringify(main.case_ids) !== JSON.stringify(['case-cz-os-pro-2t104-2010-obnova','case-cz-os-pro-2t65-2011-obnova'])) fail('hlavní podání není propojeno s oběma obnovami');
if (!main.relations?.some(r=>r.type==='reakce_na' && r.target_id==='doc-cz-os-pro-2026-09-14-15-nt-3104-2026')) fail('hlavní podání není připojeno k doložené prostějovské procesní větvi');
if (!main.relations?.some(r=>r.type==='navazuje_na' && r.target_id==='doc-cz-os-pro-2026-09-14-15-nt-3106-2026')) fail('hlavní podání nezachovává vazbu na druhou obnovu');
if (main.justice_slalom) fail('EKK 2. 10. 2026 se podle výslovného redakčního pokynu nesmí zobrazovat v Justičním slalomu');

if (annex.document_type !== 'user_submission_attachment' || annex.public?.source_original_sha256 !== '6a54415e26fe4fc36e577329a7883382c656f5e3bcc9946d4f405c61fae26afe') fail('příloha má nesprávný typ nebo SHA originálu');
if (!annex.relations?.some(r=>r.type==='priloha_k' && r.target_id===mainId)) fail('Důkazní chronologie není kanonicky přílohou hlavního podání');
if (annex.public?.public_copy_manifest?.original_pages_reviewed !== 33 || annex.public?.public_copy_manifest?.byte_identical_original !== false) fail('Důkazní chronologie má neúplnou nebo klamnou provenienci veřejné kopie');

const mainSource = await readFile('project-memory/user-text-sources-2026-10-02/ekk-os-pro-procesni-dukazni-navrh.txt','utf8');
for (const phrase of ['ORIGINAL_PAGES: 5','PROCESNÍ A DŮKAZNÍ NÁVRH','15 Nt 3104/2026','15 Nt 3106/2026','Důkazní chronologie Konopí je lék']) if (!mainSource.includes(phrase)) fail(`zdroj hlavního podání neobsahuje: ${phrase}`);
const annexSource = await readFile('project-memory/user-text-sources-2026-10-02/dukazni-chronologie-kjl-2008-2026.txt','utf8');
for (const phrase of ['ORIGINAL_PAGES: 33','DŮKAZNÍ CHRONOLOGIE','Obnova řízení 2 T 104/2010 a 2 T 65/2011','vědecká, institucionální, daňová, trestní a notifikační větev 2008–2026']) if (!annexSource.includes(phrase)) fail(`zdroj Důkazní chronologie neobsahuje: ${phrase}`);

for (const [item, expectedPages] of [[main,5],[annex,33]]) {
  const bytes = await readFile('web/'+item.public.pdf).catch(()=>fail(`chybí veřejné PDF ${item.public.pdf}`));
  const hash = sha256(bytes);
  const latin = bytes.toString('latin1');
  const pageCount = (latin.match(/\/Type\s*\/Page\b/g)||[]).length;
  if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF') || bytes.length < 4000) fail(`neplatné PDF ${item.id}`);
  if (hash !== item.public.sha256 || !String(item.public.verification_status||'').includes('verified_text_public_copy')) fail(`PDF ${item.id} nemá ověřenou veřejnou textovou provenienci`);
  if (pageCount !== expectedPages) fail(`PDF ${item.id} má ${pageCount} stran místo ${expectedPages}`);
}
const slalom = JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));
if (slalom.rows?.some(r=>r.document_id===mainId)) fail('EKK 2. 10. 2026 se navzdory pokynu objevilo v Justičním slalomu');

const cases = JSON.parse(await readFile('project-memory/cases.json','utf8'));
for (const id of main.case_ids) {
  const c = cases.cases?.find(x=>x.id===id);
  if (!c || c.last_filing_on !== '2026-10-02' || c.last_filing_document_id !== mainId || !c.related_document_ids?.includes(annexId)) fail(`případ ${id} není aktualizován o EKK balík`);
}

const cz = await readFile('web/zpravy/04082026-010.html','utf8');
const en = await readFile('web/news/04082026-010.html','utf8');
if (cz.includes(`<tr id="${mainId}"`) || en.includes(`<tr id="en-${mainId}"`)) fail('EKK podání 2. 10. se nesmí zobrazovat jako hlavní řádek Státu lásky čas');
const targetId='doc-cz-os-pro-2026-09-14-15-nt-3104-2026';
const czStart=cz.indexOf(`<tr id="${targetId}"`);
const czEnd=czStart<0?-1:cz.indexOf('</tr>',czStart);
const enStart=en.indexOf(`<tr id="en-${targetId}"`);
const enEnd=enStart<0?-1:en.indexOf('</tr>',enStart);
const czRow=czStart>=0&&czEnd>=0?cz.slice(czStart,czEnd+5):'';
const enRow=enStart>=0&&enEnd>=0?en.slice(enStart,enEnd+5):'';
if (!czRow.includes(`data-related-document-id="${mainId}"`) || !czRow.includes(main.public.pdf)) fail('CZ Godot neuvádí EKK podání jako navazující námitku/podání u reakce soudu');
if (!enRow.includes(`data-related-document-id="${mainId}"`) || !enRow.includes(main.public.pdf)) fail('EN Godot neuvádí EKK podání jako navazující námitku/podání u reakce soudu');

console.log('EKK 2. 10. 2026: podání zůstává v důkazní paměti a je pouze vztahově uvedeno u reakce soudu; není hlavním řádkem Státu lásky čas ani Justičního slalomu.');
