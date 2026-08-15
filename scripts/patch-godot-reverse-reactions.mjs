import { readFile, writeFile } from 'node:fs/promises';

const registryPath = 'project-memory/documents-2026.json';
const articlePath = 'web/zpravy/04082026-010.html';
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const documents = Array.isArray(registry.documents) ? registry.documents : [];
const byId = new Map(documents.map(item => [item.id, item]));

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const formatDate = value => {
  if (!value) return 'datum neuvedeno';
  const [y,m,d] = String(value).split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
};
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');
const isOutgoing = item => item?.submission_side === 'outgoing_from_user_or_alliance';
const isState = item => item?.submission_side === 'incoming_from_state_or_public_institution' || item?.document_type === 'state_record';

let article = await readFile(articlePath, 'utf8');
let injected = 0;
for (const state of documents.filter(isState)) {
  const sources = (state.relations || [])
    .filter(rel => (rel.type || rel.relation_type) === 'reakce_na')
    .map(rel => byId.get(rel.target_id || rel.document_id || rel.target))
    .filter(isOutgoing);
  if (!sources.length) continue;
  const needle = `<li id="${state.id}"`;
  const start = article.indexOf(needle);
  if (start < 0) throw new Error(`V Godotovi chybí státní uzel ${state.id}`);
  const end = article.indexOf('</li>', start);
  if (end < 0) throw new Error(`Uzel ${state.id} nemá </li>`);
  let block = article.slice(start, end);
  block = block.replace(/<span class="chronology-reaction chronology-reaction-source">[\s\S]*?<\/span>/g, '');
  const extra = sources.map(source => {
    const pdf = source.public?.pdf ? publicPath(source.public.pdf) : null;
    const href = pdf || `listiny/${source.id}.html`;
    const label = pdf ? 'podání PDF' : 'evidenční stránka';
    const target = pdf ? ' target="_blank" rel="noopener"' : '';
    return `<span class="chronology-reaction chronology-reaction-source"> · <b>Naše podání, na které orgán reaguje ${escapeHtml(formatDate(source.issue_date))}:</b> ${escapeHtml(source.user_title)} · <a href="${escapeHtml(href)}"${target}>${label}</a></span>`;
  }).join('');
  article = article.slice(0, start) + block + extra + article.slice(end);
  injected += sources.length;
}
await writeFile(articlePath, article, 'utf8');
console.log(`Godot: doplněno ${injected} opačných vazeb stát → naše předchozí podání.`);
