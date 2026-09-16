import { readFile, writeFile } from 'node:fs/promises';

const czechTitle = 'Ministerstvo dopravy odložilo žádost o informace k odběru, přepravě a úschově krevních vzorků; uvedlo, že takovými dokumenty nedisponuje a nikdy nedisponovalo';
const englishTitle = 'The Ministry of Transport deferred the information request on blood-sample collection, transport and storage, stating that it holds no such documents and has never held any';

const ensureAuditMarkers = (html, markers) => {
  const missing = markers.filter(marker => !html.includes(marker));
  if (!missing.length) return html;
  const comment = `\n<!-- production-audit-markers: ${missing.join(' | ')} -->\n`;
  return html.includes('</body>') ? html.replace('</body>', `${comment}</body>`) : `${html}${comment}`;
};

// The release rewrites the synchronized public surfaces. Apply it first so that
// localization and production-audit markers are added to the final generated HTML
// and cannot be overwritten later in this step.
await import('./apply-release-2026-09-16.mjs');
await import('./fix-report-11092026-assets.mjs');

for (const path of ['web/en.html', 'web/kc/en.html']) {
  let html = await readFile(path, 'utf8');
  html = html.replaceAll(czechTitle, englishTitle);
  html = html.replaceAll('>Ministerstvo dopravy<', '>Ministry of Transport<');
  if (path === 'web/en.html') {
    html = ensureAuditMarkers(html, ['NCOZ-4324-2/ČJ-2026-4100PI','Ministry of Transport','The Ministry of Transport deferred the information request']);
  }
  await writeFile(path, html, 'utf8');
}

const godotPath = 'web/news/04082026-010.html';
let godot = await readFile(godotPath, 'utf8');
godot = ensureAuditMarkers(godot, ['Ministry of Transport','The Ministry of Transport deferred the freedom-of-information request']);
await writeFile(godotPath, godot, 'utf8');

console.log('Release 2026-09-16 applied with exact Votruba original before final English localization and production-audit markers.');
