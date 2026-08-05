import { readFile, writeFile } from 'node:fs/promises';

const homePath = 'web/index.html';
const articlePath = 'web/zpravy/04082026-010.html';
const href = 'listiny/doc-cz-msz-pha-2026-06-11-3-kzn-197-2026-12.html';
const label = 'MSZ v Praze, 11. 6. 2026, č. j. 3 KZN 197/2026-12';

let article = await readFile(articlePath, 'utf8');
article = article.replace(
  new RegExp(`<a href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[^<]*<\\/a>`),
  `<a href="${href}">Otevřít listinu ${label}</a>`
);
if (!article.includes(`href="${href}"`)) {
  throw new Error('V Pavouku chybí odkaz na MSZ Praha 3 KZN 197/2026-12');
}
await writeFile(articlePath, article, 'utf8');

let home = await readFile(homePath, 'utf8');
const marker = '<main>';
const block = `\n    <section class="newsroom-alert" id="msz-3-kzn-197-2026-12">\n      <b>AKTIVNÍ LISTINA</b>\n      <span>${label} — rozdělení podání.</span>\n      <a href="${href}">Otevřít evidenční stránku listiny →</a>\n    </section>\n`;
if (!home.includes(`id="msz-3-kzn-197-2026-12"`)) {
  if (!home.includes(marker)) throw new Error('Titulní stránka nemá značku <main>');
  home = home.replace(marker, `${marker}${block}`);
}
if (!home.includes(`href="${href}"`)) {
  throw new Error('Titulní stránka neobsahuje přímý odkaz na listinu MSZ Praha');
}
await writeFile(homePath, home, 'utf8');

console.log('Přímý odkaz na MSZ Praha 3 KZN 197/2026-12 je viditelný na titulní stránce i v Pavouku.');
