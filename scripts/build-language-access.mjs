import { readFile, readdir, writeFile } from 'node:fs/promises';

const htmlFiles = (await readdir('web', { recursive: true })).filter(path => path.endsWith('.html'));
let eligible = 0;
let updated = 0;
for (const relativePath of htmlFiles) {
  const path = `web/${relativePath}`;
  let html = await readFile(path, 'utf8');
  if (!html.includes('</head>') || !html.includes('</body>')) continue;
  eligible += 1;
  const before = html;
  if (!html.includes('language-menu.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/ai-advocate-evidence-lab/language-menu.css"></head>');
  }
  if (!html.includes('auto-translate.js')) {
    html = html.replace('</body>', '<script src="/ai-advocate-evidence-lab/auto-translate.js" defer></script></body>');
  }
  if (!html.includes('auto-translate.js') || !html.includes('language-menu.css')) throw new Error(`${path}: jazyková nabídka nebyla vložena`);
  if (html !== before) {
    await writeFile(path, html, 'utf8');
    updated += 1;
  }
}
console.log(`Jazyková dostupnost: ${eligible}/${eligible} veřejných HTML ploch se záhlavím načítá automatický překlad; aktualizováno ${updated}.`);
