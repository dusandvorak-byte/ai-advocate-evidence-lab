import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fail = message => { throw new Error(`OCT-04-SUBMISSIONS-GATE: ${message}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const memory = JSON.parse(await readFile('project-memory/documents-2026.json','utf8'));
const slalom = JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));

const expected = [
  {
    id:'doc-cz-ekk-2026-10-04-klicove-dukazy-obnovy', archive:140,
    pdf:'documents/justice-slalom/2026-10/095-podani-2026-10-04-klicove-dukazy-verejna-kopie.pdf',
    publicSha:'6a50f5b6bee33a5894de50cdcf42af83d70d902a916d39f3558061d4ff78b8f7',
    sourceSha:'fccc5b47a05de21b7a59982125693996f73356ccd9c1d8fd9d8f5de3fcb32193',
    kind:'redacted_public_copy_from_user_original', recipients:5, pdfKind:'redacted_public_copy'
  },
  {
    id:'doc-cz-ekk-2026-10-04-dukazni-chronologie-kjl-2008-2026', archive:139,
    pdf:'documents/justice-slalom/2026-10/094-priloha-dukazni-chronologie-2008-2026-original.pdf',
    publicSha:'06a3b3c84cf64845a6d67e5f39e7eaa4b0829f16e5e132ce9a3cc0c80a04c8f3',
    sourceSha:'06a3b3c84cf64845a6d67e5f39e7eaa4b0829f16e5e132ce9a3cc0c80a04c8f3',
    kind:'original_pdf_uploaded_by_user', recipients:5, pdfKind:'original'
  },
  {
    id:'doc-cz-gf-jk-2026-10-04-ks-ostrava-5-to-248-sumarizujici-sdeleni', archive:141,
    pdf:'documents/justice-slalom/2026-10/096-podani-2026-10-04-ks-ostrava-verejna-kopie.pdf',
    publicSha:'f2ce716589784b0b4d078c1882b236da0b4611c4e7a7e69dc22fe21833962ef9',
    sourceSha:'3c340c53e1200ac426be98ba859ba1676b8d79ca7abf201dec06f0d7bdc64716',
    kind:'redacted_public_copy_from_user_original', recipients:1, pdfKind:'redacted_public_copy'
  }
];

for (const e of expected) {
  const d=memory.documents.find(x=>x.id===e.id);
  if(!d) fail(`chybí dokument ${e.id}`);
  if(d.issue_date!=='2026-10-04' || d.justice_slalom?.archive_number!==e.archive) fail(`datum/archiv ${e.id}`);
  if(d.public?.pdf!==e.pdf || d.public?.sha256!==e.publicSha) fail(`veřejné PDF metadata ${e.id}`);
  if(d.justice_slalom?.source_sha256!==e.sourceSha || d.justice_slalom?.source_kind!==e.kind) fail(`provenience ${e.id}`);
  if((d.justice_slalom?.recipients||[]).length!==e.recipients) fail(`adresáti ${e.id}`);
  if(e.kind==='redacted_public_copy_from_user_original' && (!d.justice_slalom.redaction_manifest || d.justice_slalom.public_sha256!==e.publicSha || e.publicSha===e.sourceSha)) fail(`redakční manifest ${e.id}`);
  const bytes=await readFile('web/'+e.pdf);
  if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF') || sha(bytes)!==e.publicSha) fail(`hash/PDF ${e.id}`);
  const rows=slalom.rows.filter(x=>x.document_id===e.id);
  if(rows.length!==e.recipients || !rows.every(x=>x.date==='2026-10-04' && x.pdf===e.pdf && x.pdf_sha256===e.publicSha && x.pdf_kind===e.pdfKind)) fail(`Justiční slalom ${e.id}`);
}
if(slalom.rows.some(x=>x.document_id==='doc-cz-ekk-2026-10-02-os-pro-procesni-dukazni-navrh')) fail('zakázaný návrh EKK z 2. 10. se vrátil do Justičního slalomu');
const topIds=slalom.rows.slice(0,11).map(x=>x.document_id);
for(const id of ['doc-cz-gf-jk-2026-10-04-ks-ostrava-5-to-248-sumarizujici-sdeleni','doc-cz-ekk-2026-10-04-klicove-dukazy-obnovy','doc-cz-ekk-2026-10-04-dukazni-chronologie-kjl-2008-2026']) if(!topIds.includes(id)) fail(`nové podání není nahoře v chronologii: ${id}`);
console.log('Podání 4. 10. 2026 OK: dvě kontrolované veřejné kopie + byte-identický originál chronologie, 11 řádků adresátů.');
