import { readFile, readdir, writeFile } from 'node:fs/promises';

const htmlFiles = (await readdir('web', { recursive: true })).filter(path => path.endsWith('.html'));
const translationAssetVersion = '20260825-2255';
let eligible = 0;
let updated = 0;
for (const relativePath of htmlFiles) {
  const path = `web/${relativePath}`;
  let html = await readFile(path, 'utf8');
  if (!html.includes('</head>') || !html.includes('</body>')) continue;
  eligible += 1;
  const before = html;
  const languageCssTags = html.match(/<link[^>]+href="(?:\/ai-advocate-evidence-lab\/)?language-menu\.css"[^>]*>/g) || [];
  if (languageCssTags.length > 1) {
    let kept = false;
    html = html.replace(/<link[^>]+href="(?:\/ai-advocate-evidence-lab\/)?language-menu\.css"[^>]*>/g, tag => kept ? '' : (kept = true, tag));
  }
  const latestRecordCssTags = html.match(/<link[^>]+href="(?:\/ai-advocate-evidence-lab\/)?latest-records\.css"[^>]*>/g) || [];
  if (latestRecordCssTags.length > 1) {
    let kept = false;
    html = html.replace(/<link[^>]+href="(?:\/ai-advocate-evidence-lab\/)?latest-records\.css"[^>]*>/g, tag => kept ? '' : (kept = true, tag));
  }
  const translationTags = html.match(/<script[^>]+src="(?:\/ai-advocate-evidence-lab\/)?auto-translate\.js(?:\?v=[^"]*)?"[^>]*><\/script>/g) || [];
  if (translationTags.length > 1) {
    let kept = false;
    html = html.replace(/<script[^>]+src="(?:\/ai-advocate-evidence-lab\/)?auto-translate\.js(?:\?v=[^"]*)?"[^>]*><\/script>/g, tag => kept ? '' : (kept = true, tag));
  }
  if (!html.includes('language-menu.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/ai-advocate-evidence-lab/language-menu.css"></head>');
  }
  if (!html.includes('auto-translate.js')) {
    html = html.replace('</body>', `<script src="/ai-advocate-evidence-lab/auto-translate.js?v=${translationAssetVersion}" defer></script></body>`);
  }
  html = html.replace(/src="(?:\/ai-advocate-evidence-lab\/)?auto-translate\.js(?:\?v=[^"]*)?"/g, `src="/ai-advocate-evidence-lab/auto-translate.js?v=${translationAssetVersion}"`);
  if (!html.includes('auto-translate.js') || !html.includes('language-menu.css')) throw new Error(`${path}: jazyková nabídka nebyla vložena`);
  if (html !== before) {
    await writeFile(path, html, 'utf8');
    updated += 1;
  }
}
console.log(`Jazyková dostupnost: ${eligible}/${eligible} veřejných HTML ploch se záhlavím načítá automatický překlad; aktualizováno ${updated}.`);
