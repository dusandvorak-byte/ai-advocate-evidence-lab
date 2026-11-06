import { readFile, writeFile } from 'node:fs/promises';

const batch = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-04-reviewed-batch.json', 'utf8'));
const attachments = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-05-okte-olomouc-attachments.json', 'utf8'));
const latest = batch.documents.filter(item => item.issue_date >= '2026-11-03' && item.issue_date <= '2026-11-06' && item.public?.pdf);
const unique = [...new Map(latest.map(item => [item.id, item])).values()];
if (unique.length !== 6) throw new Error('Unexpected November 3–6 publication inventory: ' + unique.length);
if (attachments.documents.length !== 10 || attachments.documents.some(item => !item.public?.pdf)) throw new Error('Missing OKTE original PDF inventory');

const root = '/ai-advocate-evidence-lab/';
const targets = [
  ['web/index.html', false], ['web/en.html', true],
  ['web/kc/index.html', false], ['web/kc/en.html', true],
  ['web/zpravy/04082026-010.html', false], ['web/news/04082026-010.html', true]
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
for (const [file, english] of targets) {
  let html = await readFile(file, 'utf8');
  const marker = '<!-- NOVEMBER-EVIDENCE-INDEX:BEGIN -->';
  const endmarker = '<!-- NOVEMBER-EVIDENCE-INDEX:END -->';
  const oldStart = html.indexOf(marker);
  if (oldStart >= 0) {
    const oldEnd = html.indexOf(endmarker, oldStart);
    if (oldEnd < 0) throw new Error('Unclosed November evidence panel in ' + file);
    html = html.slice(0, oldStart) + html.slice(oldEnd + endmarker.length);
  }
  const title = english ? 'Documents dated 3–4 November 2026 and ten OKTE annexes' : 'Listiny ze 3.–4. listopadu 2026 a deset příloh OKTE';
  const explanation = english
    ? 'One incoming Supreme Court record and five submissions are linked directly to their redacted PDF copies. The ten historical OKTE expert reports remain annexes to the Olomouc Police response of 30 October 2026, not ten new responses.'
    : 'Jedna příchozí listina Nejvyššího soudu a pět vlastních či spolkových podání mají přímé odkazy na redigované PDF. Deset historických vyjádření OKTE zůstává přílohami odpovědi olomoucké policie ze dne 30. října 2026, nikoli deseti novými odpověďmi.';
  const linkLabel = 'Dokument v PDF';
  const copyNote = english ? ' (redacted public copy)' : ' (redigovaná veřejná kopie)';
  const entries = unique.map(item => {
    const heading = english ? (item.english_title || item.title_en || item.user_title_en || item.user_title || item.reference || item.id) : (item.user_title || item.title || item.reference || item.id);
    return '<li data-document-id="' + esc(item.id) + '"><strong>' + esc(item.issue_date) + '</strong> — ' + esc(heading) + ' · <a href="' + root + esc(item.public.pdf) + '">' + linkLabel + '</a>' + copyNote + '</li>';
  }).join('');
  const annexLink = root + 'listiny/2026-11-02-evidence-krpm.html#okte-originaly';
  const block = marker + '<section class="november-evidence-index" id="listiny-listopad-2026" aria-label="' + esc(title) + '" style="max-width:1240px;margin:1.25rem auto;padding:1.2rem;border:1px solid #9babb3;background:#fff;color:#193448;box-sizing:border-box"><h2 style="margin-top:0">' + esc(title) + '</h2><p>' + esc(explanation) + '</p><ol>' + entries + '</ol><p><a href="' + annexLink + '">' + (english ? 'Ten original OKTE annexes' : 'Deset původních příloh OKTE') + '</a></p></section>' + endmarker;
  const main = html.indexOf('<main');
  if (main < 0) throw new Error('Missing main tag: ' + file);
  const openEnd = html.indexOf('>', main);
  if (openEnd < 0) throw new Error('Unclosed main tag: ' + file);
  html = html.slice(0, openEnd+1) + block + html.slice(openEnd+1);
  if (unique.some(item => !html.includes(item.public.pdf))) throw new Error('Missing PDF in ' + file);
  const panelLabels = [...block.matchAll(/<a[^>]+href="[^"]+"[^>]*>([^<]+)<\/a>/g)].map(match => match[1].trim());
  if (panelLabels.some(label => /PDF|kopie|listina|dokument/i.test(label) && !['Dokument v PDF','Evidenční stránka'].includes(label))) throw new Error('Invalid November panel document link label in ' + file);
  await writeFile(file, html, 'utf8');
}
console.log('November public evidence index: six documents plus ten OKTE attachments linked on six public surfaces');
