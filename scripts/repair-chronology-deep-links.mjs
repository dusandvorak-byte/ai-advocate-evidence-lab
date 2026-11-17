import { readFile, writeFile } from 'node:fs/promises';

// Keep the existing page design and published evidence unchanged.
// Fix only links whose fragment is absent from the generated Godot document.
const homePath = 'web/index.html';
const targetPath = 'web/zpravy/04082026-010.html';
const registryPath = 'web/data/documents-2026.json';
const [home, target, registryText] = await Promise.all([
  readFile(homePath, 'utf8'),
  readFile(targetPath, 'utf8'),
  readFile(registryPath, 'utf8')
]);
const registry = JSON.parse(registryText);
const documents = registry.documents || [];
const targetIds = new Set([...target.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
if (!targetIds.has('chronologie')) throw new Error('Missing target chronology anchor');
const evidenceId = caseId => documents
  .filter(item => (item.case_ids || []).includes(caseId) && targetIds.has(item.id))
  .sort((a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')))[0]?.id;

let repaired = 0;
let fallback = 0;
const updated = home.replace(/href="zpravy\/04082026-010\.html#([^"]+)"/g, (full, fragment) => {
  if (targetIds.has(fragment)) return full;
  // Prefer an existing, dated and independently addressable evidence row.
  const resolved = fragment.startsWith('case-') ? evidenceId(fragment) : null;
  const destination = resolved || 'chronologie';
  if (!targetIds.has(destination)) throw new Error('Invalid target '+destination);
  repaired += 1;
  if (!resolved) fallback += 1;
  return 'href="zpravy/04082026-010.html#'+destination+'"';
});
if (repaired > 0 && repaired < 20) throw new Error('Expected either an already-repaired page or at least 20 historical broken Godot fragments, found '+repaired);
await writeFile(homePath, updated, 'utf8');
const runtime = '<script src="/ai-advocate-evidence-lab/chronology-deep-link.js" defer></script>';
let article = target;
if (!article.includes('chronology-deep-link.js')) {
  if (!article.includes('</head>')) throw new Error('Godot page missing </head>');
  article = article.replace('</head>',runtime+'\n</head>');
  await writeFile(targetPath, article, 'utf8');
}
console.log('Godot fragment integrity: repaired '+repaired+' links; '+fallback+' safely point to chronology overview instead of inventing evidence.');

let repairedDetails = 0;
for (const item of documents) {
  const detailPath = 'web/listiny/' + item.id + '.html';
  let detail;
  try { detail = await readFile(detailPath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const oldHref = 'zpravy/04082026-010.html#' + item.id;
  const chronologyHref = 'zpravy/04082026-010.html#chronologie';
  const slalomHref = 'zpravy/04082026-010.html#justicni-slalom';
  const outgoing = item.submission_side === 'outgoing_from_user_or_alliance';
  const fallback = outgoing && targetIds.has('justicni-slalom') ? 'justicni-slalom' : 'chronologie';
  const destination = targetIds.has(item.id) ? item.id : fallback;
  if (!targetIds.has(destination)) throw new Error('Missing detail return target ' + destination);

  const currentHref = [oldHref, chronologyHref, slalomHref].find(href => detail.includes(href));
  if (!currentHref) continue;
  const desiredHref = 'zpravy/04082026-010.html#' + destination;
  const desiredLabel = destination === item.id
    ? 'Zpět do chronologie'
    : destination === 'justicni-slalom'
      ? 'Přejít na přehled podání'
      : 'Přejít na přehled chronologie';

  let updatedDetail = detail;
  if (currentHref !== desiredHref) updatedDetail = updatedDetail.replace(currentHref, desiredHref);
  updatedDetail = updatedDetail.replace(
    /(?:Zpět do chronologie|Přejít na přehled podání|Přejít na přehled chronologie)/,
    desiredLabel
  );
  if (updatedDetail === detail) continue;
  await writeFile(detailPath, updatedDetail, 'utf8');
  repairedDetails += 1;
}
console.log('Godot detail page returns: '+repairedDetails+' unmatched anchors repaired.');

