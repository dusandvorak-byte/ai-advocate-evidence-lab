import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PARENT_ID = 'doc-cz-pcr-krpo-2026-10-30-krpm-145410-2';
export const OBSOLETE_NOTE = 'tyto samostatné soubory nebyly s tímto PDF poskytnuty';

export function validateFinalOkteRelations(registry, expectedAnnexes) {
  const errors = [];
  const records = registry?.documents || [];
  const byId = new Map(records.map(record => [record.id, record]));
  const parent = byId.get(PARENT_ID);
  if (!parent) return ['Missing OKTE parent in final public registry'];

  const links = (parent.relations || []).filter(link => link.type === 'priloha');
  const expectedIds = new Set(expectedAnnexes.map(item => item.id));
  const actualIds = links.map(link => link.target_id);
  if (links.length !== expectedIds.size
      || new Set(actualIds).size !== expectedIds.size
      || actualIds.some(id => !expectedIds.has(id))) {
    errors.push(`OKTE forward annex relations: expected ${expectedIds.size}, got ${links.length} [${actualIds.join(', ')}]`);
  }
  if (String(parent.evidence_note || '').toLowerCase().includes(OBSOLETE_NOTE.toLowerCase())) {
    errors.push('OKTE parent contains obsolete missing-annex note');
  }
  for (const source of expectedAnnexes) {
    const annex = byId.get(source.id);
    if (!annex) {
      errors.push(`Missing OKTE annex in final registry: ${source.id}`);
      continue;
    }
    if (!(annex.relations || []).some(link => link.type === 'priloha_k' && link.target_id === PARENT_ID)) {
      errors.push(`Missing OKTE reverse annex relation: ${source.id}`);
    }
    if (!annex.public?.pdf || annex.public.pdf !== source.public?.pdf) {
      errors.push(`Missing/mismatched public OKTE PDF path: ${source.id}`);
    }
  }
  return errors;
}

async function main() {
  const expected = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-05-okte-olomouc-attachments.json', 'utf8')).documents;
  const final = JSON.parse(await readFile('web/data/documents-2026.json', 'utf8'));
  const errors = validateFinalOkteRelations(final, expected);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Final public OKTE registry PASS: ${expected.length} parent links, ${expected.length} reverse links, verified PDF paths, current note`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}
