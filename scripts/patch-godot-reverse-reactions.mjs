import { readFile } from 'node:fs/promises';

const registryPath = 'project-memory/documents-2026.json';
const articlePath = 'web/zpravy/04082026-010.html';
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const documents = Array.isArray(registry.documents) ? registry.documents : [];
const byId = new Map(documents.map(item => [item.id, item]));
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');
const isOutgoing = item => item?.submission_side === 'outgoing_from_user_or_alliance';
const isState = item => item?.document_type !== 'state_record_attachment'
  && (item?.submission_side === 'incoming_from_state_or_public_institution' || item?.document_type === 'state_record');
const uniqueById = items => [...new Map(items.filter(Boolean).map(item => [item.id,item])).values()];

const article = await readFile(articlePath, 'utf8');
const tableStart = article.indexOf('<table id="chronologie-seznam"');
const tableEnd = tableStart < 0 ? -1 : article.indexOf('</table>', tableStart);
if (tableStart < 0 || tableEnd < 0 || !article.includes('state-love-table')) {
  throw new Error('REVERSE-REACTION-GATE: Státu lásky čas není tabulka');
}
const table = article.slice(tableStart, tableEnd + 8);
if (table.includes('data-submission-side="outgoing_from_user_or_alliance"')) {
  throw new Error('REVERSE-REACTION-GATE: naše podání je chybně samostatným řádkem');
}

let checkedSources = 0;
let checkedRemedies = 0;
for (const state of documents.filter(isState).filter(item => String(item.issue_date || '') >= '2026-05-01')) {
  const stateMarker = `<tr id="${state.id}"`;
  const stateStart = table.indexOf(stateMarker);
  if (stateStart < 0) throw new Error(`REVERSE-REACTION-GATE: chybí hlavní řádek orgánu ${state.id}`);
  const stateEnd = table.indexOf('</tr>', stateStart);
  if (stateEnd < 0) throw new Error(`REVERSE-REACTION-GATE: neuzavřený řádek orgánu ${state.id}`);
  const row = table.slice(stateStart, stateEnd + 5);

  const directSources = (state.relations || [])
    .filter(rel => (rel.type || rel.relation_type) === 'reakce_na')
    .map(rel => byId.get(rel.target_id || rel.document_id || rel.target))
    .filter(isOutgoing);
  const reverseSources = documents.filter(isOutgoing).filter(item => (item.relations || []).some(rel =>
    (rel.type || rel.relation_type) === 'podani_na_ktere_organ_reaguje'
    && (rel.target_id || rel.document_id || rel.target) === state.id
  ));
  const sources = uniqueById([...directSources, ...reverseSources]);
  const remedies = uniqueById(documents.filter(isOutgoing).filter(item => (item.relations || []).some(rel =>
    (rel.type || rel.relation_type) === 'reakce_na'
    && (rel.target_id || rel.document_id || rel.target) === state.id
  )));

  for (const source of sources) {
    if (!row.includes(`data-related-document-id="${source.id}"`)) {
      throw new Error(`REVERSE-REACTION-GATE: u reakce ${state.id} chybí původní podání ${source.id}`);
    }
    if (source.public?.pdf) {
      const pdf = publicPath(source.public.pdf);
      if (!row.includes(`href="${pdf}"`) && !row.includes(`href='/ai-advocate-evidence-lab/${pdf}'`) && !row.includes(`href="/ai-advocate-evidence-lab/${pdf}"`)) {
        throw new Error(`REVERSE-REACTION-GATE: původní podání ${source.id} nemá u reakce aktivní PDF ${pdf}`);
      }
    }
    checkedSources += 1;
  }

  for (const remedy of remedies) {
    if (!row.includes(`data-related-document-id="${remedy.id}"`)) {
      throw new Error(`REVERSE-REACTION-GATE: u reakce ${state.id} chybí navazující námitka/opravný prostředek ${remedy.id}`);
    }
    if (remedy.public?.pdf) {
      const pdf = publicPath(remedy.public.pdf);
      if (!row.includes(`href="${pdf}"`) && !row.includes(`href='/ai-advocate-evidence-lab/${pdf}'`) && !row.includes(`href="/ai-advocate-evidence-lab/${pdf}"`)) {
        throw new Error(`REVERSE-REACTION-GATE: námitka ${remedy.id} nemá u reakce aktivní PDF ${pdf}`);
      }
    }
    checkedRemedies += 1;
  }
}
console.log(`Godot tabulka: ${checkedSources} vazeb „na co orgán reaguje“, ${checkedRemedies} vazeb „námitka / opravný prostředek“; vlastní podání nejsou hlavními řádky.`);
