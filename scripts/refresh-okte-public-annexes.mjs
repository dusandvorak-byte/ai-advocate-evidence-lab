import { readFile, writeFile } from 'node:fs/promises';

const parent = 'web/listiny/2026-11-02-evidence-krpm.html';
const section = /<section class="record-page" id="okte-originaly">[\s\S]*?<\/section>/g;
const load = async path => JSON.parse(await readFile(path, 'utf8'));
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sourceRegistry = await load('project-memory/documents-2026-supplement-2026-11-05-okte-olomouc-attachments.json');
const documents = await load('project-memory/documents-2026.json');
const approved = await load('project-memory/okte-structural-public-copies.json');
const publicById = new Map(documents.documents.map(item => [item.id, item.public]));
const items = [];

for (const source of sourceRegistry.documents.toSorted((a, b) => a.annex_index - b.annex_index)) {
  const original = source.public.source_original_sha256;
  const published = publicById.get(source.id);
  if (published?.pdf !== source.public.pdf || !/^[0-9a-f]{64}$/.test(published.sha256)) {
    throw new Error(`Missing final OKTE path or hash for ${source.id}`);
  }
  const changed = original !== published.sha256;
  const transformed = (published.verification_status || '').split('; ').includes('okte_structural_public_copy');
  if (changed && (approved.records[source.id] !== original || !transformed)) {
    throw new Error(`Unapproved OKTE public-copy identity for ${source.id}`);
  }
  const description = changed
    ? 'Upravená veřejná kopie <span lang="en">(structurally normalized public copy)</span>'
      + ` · SHA-256 zdroje <code>${original}</code> · SHA-256 veřejné kopie <code>${published.sha256}</code>`
    : `Binárně shodný originál <span lang="en">(byte-identical original)</span> · SHA-256 <code>${original}</code>`;
  items.push(
    `<li data-okte-id="${escapeHtml(source.id)}"><a href="/ai-advocate-evidence-lab/${escapeHtml(published.pdf)}" download>`
    + `Úroda ${escapeHtml(source.harvest_label)} – ${escapeHtml(source.reference)}</a>`
    + ` · ${escapeHtml(source.issue_date)} · ${source.public.source_original_page_count} stran · ${description}</li>`,
  );
}

if (items.length !== 10) throw new Error('Expected ten OKTE annexes');
const html = await readFile(parent, 'utf8');
if ([...html.matchAll(section)].length !== 1) throw new Error('Expected one existing OKTE annex section');
const updated = html.replace(section, () => '<section class="record-page" id="okte-originaly">'
  + '<h2>Deset odborných vyjádření OKTE k odpovědi policie z 30. 10. 2026</h2>'
  + '<p>U každé přílohy je uvedené datum vyjádření, počet stran a SHA-256. U upravených veřejných kopií uvádíme také SHA-256 archivovaného zdroje.</p>'
  + '<p lang="en">Each annex lists its date, page count and SHA-256. A structurally normalized public copy also lists the hash of the archived source.</p>'
  + `<ol>${items.join('')}</ol>`
  + '<p><a href="/ai-advocate-evidence-lab/documents/2026-11-04/2026-11-03-okte-srovnavaci-analyza-redigovany-original.pdf">40stránková autorská srovnávací analýza</a></p></section>');
await writeFile(parent, updated, 'utf8');
