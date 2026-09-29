import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const json = async p => JSON.parse(await readFile(p,'utf8'));
const fail = msg => { throw new Error(`STATE-RELEASE-2026-09-29: ${msg}`); };
const source = await json('project-memory/source-verification-2026-09-29-ksz-vs.json');
const registry = await json('web/data/documents-2026.json');
const translations = await json('project-memory/english-godot-translations.json');
const timers = await json('web/data/process-timers.json');
const pages = await Promise.all(['web/zpravy/04082026-010.html','web/news/04082026-010.html'].map(p=>readFile(p,'utf8')));
// A successful static check is insufficient if a legacy client then replaces
// the chronology. Refuse that renderer after every final publication writer.
const checkClientRenderers = async dir => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await checkClientRenderers(path);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      if (/<script\b[^>]*\bsrc=["'][^"']*\bdocument-chronology\.js(?:[?"'])/i.test(html)) fail(`legacy client chronology renderer in ${path}`);
    }
  }
};
await checkClientRenderers('web');
for (const file of source.files) {
  const doc = registry.documents.find(d=>d.id===file.document_id);
  if (!doc || doc.issue_date!==file.issue_date || doc.reference!==file.reference || doc.received_date!==null || doc.public.pdf!==file.public_pdf) fail(`canonical record ${file.document_id}`);
  const data = await readFile(`web/${file.public_pdf}`);
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha!==file.source_sha256 || sha!==file.public_sha256 || sha!==doc.public.sha256 || !data.subarray(0,5).equals(Buffer.from('%PDF-')) || !data.subarray(-2048).toString('latin1').includes('%%EOF')) fail(`PDF integrity ${file.document_id}`);
  if (!translations.documents[file.document_id]) fail(`English description ${file.document_id}`);
  for (const [index, page] of pages.entries()) {
    const block = page.match(new RegExp(`<li\\b[^>]*(?:id|data-document-id)="${file.document_id}"[^>]*>[\\s\\S]*?(?=<li\\b|<\\/ol>)`))?.[0];
    if (!block || !block.includes(file.reference) || !block.includes(file.public_pdf)) fail(`public record/PDF ${file.document_id}`);
    const pdfLinks = [...block.matchAll(/<a\b[^>]*href="([^"]+\.pdf)"[^>]*>([^<]+)<\/a>/g)];
    for (const [, href, label] of pdfLinks) {
      const allowed = index === 0 ? ['Dokument v PDF'] : ['PDF document', 'Original Czech PDF'];
      if (!allowed.includes(label) || (/verejna-kopie|public-copy/.test(href) && /Original/.test(label))) fail(`public PDF label ${file.document_id}: ${label}`);
    }
    if (index === 0) for (const id of doc.case_ids || []) {
      if (!block.includes(`href="#${id}"`) || !page.includes(`id="${id}"`)) fail(`missing case anchor ${file.document_id}: ${id}`);
    }
    const preceding = registry.documents.filter(d => (d.relations || []).some(r =>
      (r.type || r.relation_type) === 'podani_na_ktere_organ_reaguje' && (r.target_id || r.document_id) === doc.id));
    for (const submission of preceding) {
      const pdf = submission.public?.pdf?.replace(/^web\//, '');
      if (!pdf || !block.includes(pdf)) fail(`missing preceding filing ${file.document_id}: ${submission.id}`);
    }
  }
  for (const id of doc.closes_timer_ids || []) {
    if (timers.timers.some(timer=>timer.id===id)) fail(`closed phase still active: ${id}`);
    if (!timers.resolved_process_steps?.some(step=>step.id===id && step.decision_document_id===doc.id)) fail(`missing decision history: ${id}`);
  }
}
console.log('State release 2026-09-29 OK: source-identical PDFs, canonical dates, CZ/EN entries, labels, case/filing relations, resolved KSZ phase and no client overwrite.');
