import { readFile, writeFile } from 'node:fs/promises';

const homePath = 'web/index.html';
const articlePath = 'web/zpravy/04082026-010.html';
const archivePath = 'web/zpravy/index.html';
const feedPath = 'web/news-feed.js';
const liveDocketsPath = 'web/live-dockets.js';
const evidencePath = 'web/listiny/doc-cz-msz-pha-2026-06-11-3-kzn-197-2026-12.html';
const href = 'listiny/doc-cz-msz-pha-2026-06-11-3-kzn-197-2026-12.html';
const label = 'MSZ v Praze, 11. 6. 2026, č. j. 3 KZN 197/2026-12';
const correctSummary = 'Chronologický seznam dokumentů sbírky Godot on-line od 1. května do 3. srpna 2026.';

const fixSummary = text => text
  .replaceAll('Chronologický seznam dokumentů sbírky Godot on-line od 1. května 2026. května do 3. srpna 2026.', correctSummary)
  .replaceAll('Chronologický seznam dokumentů sbírky Godot on-line od 1. května 2026.', correctSummary)
  .replaceAll('Chronologický seznam 55 dokumentů sbírky Godot on-line od 6. května do 3. srpna 2026.', correctSummary)
  .replaceAll('Chronologický seznam sbírky Godot on-line od května 2026: 55 rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů do 3. srpna 2026.', correctSummary);

let article = await readFile(articlePath, 'utf8');
article = article.replace(
  new RegExp(`<a href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[^<]*<\\/a>`),
  `<a href="${href}">Otevřít evidenční stránku ${label}</a>`
);
if (!article.includes(`href="${href}"`)) {
  throw new Error('V Pavouku chybí odkaz na MSZ Praha 3 KZN 197/2026-12');
}
await writeFile(articlePath, article, 'utf8');

let home = fixSummary(await readFile(homePath, 'utf8'));
const marker = '<main>';
const block = `\n    <section class="newsroom-alert" id="msz-3-kzn-197-2026-12">\n      <b>EVIDENČNÍ ZÁZNAM</b>\n      <span>${label} — rozdělení podání; originální PDF zatím není ve veřejném repozitáři.</span>\n      <a href="${href}">Otevřít evidenční stránku →</a>\n    </section>\n`;
if (!home.includes(`id="msz-3-kzn-197-2026-12"`)) {
  if (!home.includes(marker)) throw new Error('Titulní stránka nemá značku <main>');
  home = home.replace(marker, `${marker}${block}`);
} else {
  home = home.replace(/<section class="newsroom-alert" id="msz-3-kzn-197-2026-12">[\s\S]*?<\/section>/, block.trim());
}
if (!home.includes(`href="${href}"`)) {
  throw new Error('Titulní stránka neobsahuje přímý odkaz na evidenční stránku MSZ Praha');
}
if (!home.includes(correctSummary)) {
  throw new Error('Titulní stránka neobsahuje správné období hlavní zprávy');
}
if (/2026\.\s*května do 3\. srpna 2026/i.test(home)) {
  throw new Error('Na titulní stránce zůstal slepený chybný údaj období');
}
await writeFile(homePath, home, 'utf8');

for (const path of [archivePath, feedPath, liveDocketsPath]) {
  const current = await readFile(path, 'utf8');
  const corrected = fixSummary(current);
  if (/2026\.\s*května do 3\. srpna 2026/i.test(corrected)) {
    throw new Error(`V souboru ${path} zůstal slepený chybný údaj období`);
  }
  await writeFile(path, corrected, 'utf8');
}

const evidencePage = `<!doctype html>
<html lang="cs">
<head>
  <base href="https://dusandvorak-byte.github.io/ai-advocate-evidence-lab/">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MSZ v Praze · 3 KZN 197/2026-12</title>
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="brand.css">
</head>
<body>
  <main class="article-shell">
    <article>
      <header class="article-header">
        <p class="kicker">MĚSTSKÉ STÁTNÍ ZASTUPITELSTVÍ V PRAZE · EVIDENČNÍ ZÁZNAM</p>
        <h1>3 KZN 197/2026-12</h1>
        <p class="standfirst">Rozdělení podání ze dne 11. června 2026</p>
      </header>
      <div class="article-body">
        <p><b>Datum dokumentu:</b> 11. 6. 2026</p>
        <p><b>Instituce:</b> Městské státní zastupitelství v Praze</p>
        <p><b>Procesní význam:</b> rozdělení podání převzatého od Nejvyššího státního zastupitelství mezi KSZ v Ostravě, MSZ v Brně, příslušnou větev MSZ v Praze a OSZ pro Prahu 2, 4 a 7.</p>
        <p><b>Stabilní ID:</b> <code>doc-cz-msz-pha-2026-06-11-3-kzn-197-2026-12</code></p>
        <p><b>Důležité upozornění:</b> tato stránka je pouze evidenční záznam. Originální PDF č. j. 3 KZN 197/2026-12 dosud není fyzicky uloženo ve veřejném repozitáři, proto zde nelze zobrazit jeho obraz ani úplný text.</p>
        <p><a href="zpravy/04082026-010.html#doc-cz-msz-pha-2026-06-11-3-kzn-197-2026-12">Zpět do chronologie</a></p>
      </div>
    </article>
  </main>
</body>
</html>`;
await writeFile(evidencePath, evidencePage, 'utf8');

console.log('Opraveno období hlavní zprávy ve statickém HTML, archivu, feedu i klientském skriptu; MSZ Praha zůstává označeno jako evidenční stránka bez originálního PDF.');
