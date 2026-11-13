import { readFile } from 'node:fs/promises';

const targets = [
  ['web/index.html','web/zpravy/04082026-010.html','zpravy/04082026-010.html'],
  ['web/en.html','web/news/04082026-010.html','news/04082026-010.html']
];
for (const [sourcePath, targetPath, relativeTarget] of targets) {
  const [source, target] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(targetPath, 'utf8')
  ]);
  const targetIds = new Set([...target.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const links = [...source.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    .filter(href => href.startsWith(relativeTarget + '#'));
  const bad = links.filter(href => !targetIds.has(href.split('#')[1]));
  if (bad.length) throw new Error('BROKEN_CHRONOLOGY_FRAGMENTS in '+sourcePath+': '+bad.join(', '));
  console.log(sourcePath+': '+links.length+' links to valid evidence anchors');
}
const target = await readFile('web/zpravy/04082026-010.html', 'utf8');
if (!target.includes('chronology-deep-link.js')) throw new Error('Deep-link reveal handler missing');

const registry = JSON.parse(await readFile('web/data/documents-2026.json','utf8'));
const godot = await readFile('web/zpravy/04082026-010.html','utf8');
const godotIds = new Set([...godot.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
let detailCount = 0;
for (const doc of registry.documents || []) {
  let html;
  try { html = await readFile('web/listiny/'+doc.id+'.html','utf8'); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  for (const hit of html.matchAll(/href="zpravy\/04082026-010\.html#([^"]+)"/g)) {
    if (!godotIds.has(hit[1])) throw new Error('Broken detail return from '+doc.id+' to #'+hit[1]);
    detailCount += 1;
  }
}
console.log('Godot detail return anchors verified: '+detailCount);
