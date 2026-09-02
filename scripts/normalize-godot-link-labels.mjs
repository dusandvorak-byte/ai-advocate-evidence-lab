import { readFile, writeFile, readdir } from 'node:fs/promises';

const czGodotPath = 'web/zpravy/04082026-010.html';
const enGodotPath = 'web/news/04082026-010.html';
const surfacePaths = [
  ['web/index.html', 'cs'],
  ['web/en.html', 'en'],
  ['web/kc/index.html', 'cs'],
  ['web/kc/en.html', 'en']
];

const replaceAnchorTextByHref = (html, hrefPattern, label) => html.replace(
  new RegExp(`<a([^>]*\\bhref=["'][^"']*${hrefPattern}[^"']*["'][^>]*)>[\\s\\S]*?<\\/a>`, 'gi'),
  (_match, attrs) => `<a${attrs}>${label}</a>`
);

const normalizeGodot = async (path, lang) => {
  let html = await readFile(path, 'utf8');
  const pdfLabel = lang === 'cs' ? 'Dokument v PDF' : 'PDF document';
  const evidenceLabel = lang === 'cs' ? 'Evidenční stránka' : 'Evidence page';

  const chronologyId = lang === 'cs' ? 'chronologie-seznam' : 'en-chronology-list';
  const startMarker = `id="${chronologyId}"`;
  const start = html.indexOf(startMarker);
  if (start !== -1) {
    const olStart = html.lastIndexOf('<ol', start);
    const olEnd = html.indexOf('</ol>', start);
    if (olStart !== -1 && olEnd !== -1) {
      const before = html.slice(0, olStart);
      let block = html.slice(olStart, olEnd + 5);
      block = replaceAnchorTextByHref(block, "\\.pdf(?:[?#][^\"']*)?", pdfLabel);
      block = replaceAnchorTextByHref(block, "(?:listiny|news\\/04082026-010\\.html#)[^\"']*", evidenceLabel);
      html = before + block + html.slice(olEnd + 5);
    }
  }

  await writeFile(path, html, 'utf8');
};

await normalizeGodot(czGodotPath, 'cs');
try {
  await normalizeGodot(enGodotPath, 'en');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

for (const [path, lang] of surfacePaths) {
  let html = await readFile(path, 'utf8');
  const pdfLabel = lang === 'cs' ? 'Dokument v PDF' : 'PDF document';
  const evidenceLabel = lang === 'cs' ? 'Evidenční stránka' : 'Evidence page';
  html = html.replace(/(<a\b[^>]*class=["'][^"']*latest-record-pdf[^"']*["'][^>]*>)[\s\S]*?(<\/a>)/gi, `$1${pdfLabel}$2`);
  html = html.replace(/(<span\b[^>]*class=["'][^"']*latest-record-pending[^"']*["'][^>]*>)[\s\S]*?(<\/span>)/gi, `$1${evidenceLabel}$2`);
  await writeFile(path, html, 'utf8');
}

const listiny = await readdir('web/listiny');
for (const name of listiny.filter(name => name.endsWith('.html'))) {
  const path = `web/listiny/${name}`;
  let html = await readFile(path, 'utf8');
  html = replaceAnchorTextByHref(html, "\\.pdf(?:[?#][^\"']*)?", 'Dokument v PDF');
  html = html.replace(/<p><b>Originální PDF:<\/b>[\s\S]*?<\/p>/gi, '<p><b>Evidenční stránka</b></p>');
  await writeFile(path, html, 'utf8');
}

const czGodot = await readFile(czGodotPath, 'utf8');
const chronologyStart = czGodot.indexOf('id="chronologie-seznam"');
const chronologyEnd = chronologyStart === -1 ? -1 : czGodot.indexOf('</ol>', chronologyStart);
if (chronologyStart === -1 || chronologyEnd === -1) throw new Error('Godot nemá statickou chronologii pro kontrolu popisků');
const chronology = czGodot.slice(chronologyStart, chronologyEnd + 5);
const forbidden = [
  'Originální PDF', 'originál PDF', 'anonymizovaná veřejná kopie PDF', 'stránka listiny',
  'příloha PDF', 'podání PDF', 'reakce PDF', 'PDF dosud není veřejné'
];
for (const label of forbidden) {
  if (chronology.toLocaleLowerCase('cs-CZ').includes(label.toLocaleLowerCase('cs-CZ'))) {
    throw new Error(`Godot obsahuje zakázaný popisek odkazu: ${label}`);
  }
}

const pdfLinks = (chronology.match(/>Dokument v PDF<\/a>/g) || []).length;
const evidenceLinks = (chronology.match(/>Evidenční stránka<\/a>/g) || []).length;
if (pdfLinks + evidenceLinks === 0) throw new Error('Godot po normalizaci neobsahuje žádný standardizovaný odkaz');
console.log(`Godot link labels: ${pdfLinks} × Dokument v PDF; ${evidenceLinks} × Evidenční stránka. CZ/EN veřejné plochy synchronizovány.`);
