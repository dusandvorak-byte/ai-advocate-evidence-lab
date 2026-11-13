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
const targetIds = new Set([...target.matchAll(/\\bid="([^"]+)"/g)].map(match => match[1]));
if (!targetIds.has('chronologie')) throw new Error('Missing target chronology anchor');
const evidenceId = caseId => documents
  .filter(item => (item.case_ids || []).includes(caseId) && targetIds.has(item.id))
  .sort((a, b) => String(b.issue_date || '').localeCompare(String(a.issue_date || '')))[0]?.id;

let repaired = 0;
let fallback = 0;
const updated = home.replace(/href="zpravy\\/04082026-010\\.html#([^"]+)"/g, (full, fragment) => {
  if (targetIds.has(fragment)) return full;
  // Prefer an existing, dated and independently addressable evidence row.
  const resolved = fragment.startsWith('case-') ? evidenceId(fragment) : null;
  const destination = resolved || 'chronologie';
  if (!targetIds.has(destination)) throw new Error('Invalid target '+destination);
  repaired += 1;
  if (!resolved) fallback += 1;
  return 'href="zpravy/04082026-010.html#'+destination+'"';
});
if (repaired < 20) throw new Error('Expected at least 20 historical broken Godot fragments, found '+repaired);
await writeFile(homePath, updated, 'utf8');
const runtime = '<script src="/ai-advocate-evidence-lab/chronology-deep-link.js" defer></script>';
let article = target;
if (!article.includes('chronology-deep-link.js')) {
  if (!article.includes('</head>')) throw new Error('Godot page missing </head>');
  article = article.replace('</head>',runtime+'\n</head>');
  await writeFile(targetPath, article, 'utf8');
}
console.log('Godot fragment integrity: repaired '+repaired+' links; '+fallback+' safely point to chronology overview instead of inventing evidence.');
