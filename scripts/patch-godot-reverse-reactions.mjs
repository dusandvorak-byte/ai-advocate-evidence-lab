import { readFile } from 'node:fs/promises';

const registryPath = 'project-memory/documents-2026.json';
const articlePath = 'web/zpravy/04082026-010.html';
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const documents = Array.isArray(registry.documents) ? registry.documents : [];
const byId = new Map(documents.map(item => [item.id, item]));
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');
const isOutgoing = item => item?.submission_side === 'outgoing_from_user_or_alliance';
const isState = item => item?.submission_side === 'incoming_from_state_or_public_institution' || item?.document_type === 'state_record';

const article = await readFile(articlePath, 'utf8');
if (!article.includes('id="chronologie-seznam"') || !article.includes('state-love-table')) {
  throw new Error('REVERSE-REACTION-GATE: Státu lásky čas není tabulka');
}

let checked = 0;
for (const state of documents.filter(isState)) {
  const sources = (state.relations || [])
    .filter(rel => (rel.type || rel.relation_type) === 'reakce_na')
    .map(rel => byId.get(rel.target_id || rel.document_id || rel.target))
    .filter(isOutgoing);
  if (!sources.length) continue;

  const stateMarker = `<tr id="${state.id}"`;
  if (!article.includes(stateMarker)) throw new Error(`REVERSE-REACTION-GATE: chybí tabulkový řádek státu ${state.id}`);

  for (const source of sources) {
    const sourceMarker = `<tr id="${source.id}"`;
    if (!article.includes(sourceMarker)) throw new Error(`REVERSE-REACTION-GATE: chybí tabulkový řádek navazujícího podání ${source.id}`);
    if (source.public?.pdf) {
      const start = article.indexOf(sourceMarker);
      const end = article.indexOf('</tr>', start);
      if (end < 0) throw new Error(`REVERSE-REACTION-GATE: neuzavřený tabulkový řádek ${source.id}`);
      const row = article.slice(start, end + 5);
      const pdf = publicPath(source.public.pdf);
      if (!row.includes(`href="${pdf}"`) && !row.includes(`href='${pdf}'`)) {
        throw new Error(`REVERSE-REACTION-GATE: podání ${source.id} nemá v tabulce kanonický PDF odkaz ${pdf}`);
      }
    }
    checked += 1;
  }
}

console.log(`Godot tabulka: ověřeno ${checked} opačných vztahových vazeb stát → naše podání; nic se neinjektuje mimo tabulku.`);
