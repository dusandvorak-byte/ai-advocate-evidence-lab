import { access, readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const documents = (await readJson('web/data/documents-2026.json')).documents || [];
const timers = (await readJson('web/data/process-timers.json')).timers || [];
const audit = await readJson('web/data/godot-pdf-audit.json');
const godot = await readFile('web/zpravy/04082026-010.html', 'utf8');
const home = await readFile('web/index.html', 'utf8');
const surfaces = ['web/index.html','web/en.html','web/kc/index.html','web/kc/en.html','web/zpravy/04082026-010.html'];
const publicPath = value => `web/${String(value || '').replace(/^\.\//,'').replace(/^\/+/, '').replace(/^web\//,'')}`;
const errors = [];

if (audit.broken_article_pdf_link_count !== 0) errors.push(`Godot má ${audit.broken_article_pdf_link_count} nefunkčních PDF odkazů`);
if (audit.missing_rendered_reaction_count !== 0) errors.push(`Godot nevykreslil ${audit.missing_rendered_reaction_count} kanonických reakcí`);
if (audit.missing_reaction_pdf_link_count !== 0) errors.push(`Godot má ${audit.missing_reaction_pdf_link_count} reakcí bez povinného aktivního PDF`);

for (const doc of documents) {
  const intended = doc.public?.intended_pdf;
  const pdf = doc.public?.pdf;
  if (intended && !pdf) errors.push(`${doc.id}: existuje ověřený intended_pdf, ale public.pdf zůstal prázdný`);
  if (pdf) {
    const path = publicPath(pdf);
    try {
      await access(path);
      const head = await readFile(path, { encoding: null });
      if (head.subarray(0,5).toString() !== '%PDF-') errors.push(`${doc.id}: ${pdf} není platný PDF soubor`);
    } catch {
      errors.push(`${doc.id}: aktivní PDF fyzicky chybí: ${pdf}`);
    }
  }
}

const remedyPattern = /\b(stížnost|stížnosti|odvolání|rozklad)\b/i;
const remedies = documents.filter(doc => doc.submission_side === 'outgoing_from_user_or_alliance' && (doc.document_type === 'appeal' || remedyPattern.test([doc.user_title,doc.reference,...(doc.topics||[])].join(' '))));
const timerSources = new Set(timers.map(item => item.source_document_id).filter(Boolean));
for (const doc of remedies) if (!timerSources.has(doc.id)) errors.push(`${doc.id}: opravný prostředek nemá procesní časovač`);

for (const doc of remedies) {
  const reaction = (doc.relations || []).find(rel => rel.type === 'reakce_na' && rel.target_id);
  if (!reaction) continue;
  const targetAnchor = `id="${reaction.target_id}"`;
  if (!godot.includes(targetAnchor)) errors.push(`${doc.id}: cílová listina ${reaction.target_id} není v Godotovi`);
  if (!godot.includes(doc.user_title)) errors.push(`${doc.id}: reakce není vykreslena inline v Godotovi`);
  if (doc.public?.pdf && !godot.includes(doc.public.pdf)) errors.push(`${doc.id}: inline reakce neobsahuje aktivní PDF ${doc.public.pdf}`);
}

const tagline = 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
if (!home.includes(tagline)) errors.push('Titulní strana nemá závazný podtext CannaInsider.EU');
if (/Aktualizováno\s+\d{1,2}\./i.test(home)) errors.push('Titulní strana znovu obsahuje duplicitní datum „Aktualizováno …“');

for (const path of surfaces) {
  const html = await readFile(path, 'utf8');
  if (!html.includes('href="shell-axis.css"')) errors.push(`${path}: chybí společná shell-axis.css`);
  if (!html.includes('styles.css') || !html.includes('brand.css')) errors.push(`${path}: chybí společný newsroom CSS základ`);
}

const requiredIds = [
  'doc-cz-citc-2026-08-10-stiznost-kpr-5772-2026-2',
  'doc-cz-dd-2026-07-31-stiznost-msz-necinnost-infz',
  'doc-cz-dd-2026-07-31-odvolani-msz-sin-48-2026-12',
  'doc-cz-dd-2026-08-01-odvolani-nsz-sin-55-2026-19',
  'doc-cz-gfaa-2026-08-12-rozklad-mv-127234-2-obp-2026',
  'doc-cz-dd-2026-08-10-stiznost-15-nt-3105-2026-54',
  'doc-cz-dd-2026-08-11-stiznost-15-nt-3103-2026-53',
  'doc-cz-dd-2026-08-10-stiznost-necinnost-msp'
];
for (const id of requiredIds) if (!timerSources.has(id)) errors.push(`Povinný aktuální opravný prostředek chybí v časovači: ${id}`);

if (errors.length) {
  console.error('PUBLIKAČNÍ INVARIANTY SELHALY:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Publikační invarianty OK: ${documents.length} dokumentů, ${remedies.length} opravných prostředků, ${audit.article_pdf_link_count} aktivních PDF odkazů v Godotovi, 5/5 veřejných ploch na společné ose.`);
