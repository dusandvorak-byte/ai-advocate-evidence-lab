import { readFile, writeFile } from 'node:fs/promises';

// Do NOT create an editorial article/panel from evidentiary documents.
// Incoming institutional records belong in Godot; submissions by Dušan or
// alliance organizations belong in Justiční slalom. The ten OKTE PDFs are
// annexes of the police response of 30 October, not new Godot responses.
// This terminal step also removes panels left by the previous generator.
const batch = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-04-reviewed-batch.json', 'utf8'));
const annexes = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-05-okte-olomouc-attachments.json', 'utf8'));
const documents = batch.documents.filter(item => item.issue_date >= '2026-11-03' && item.issue_date <= '2026-11-06' && item.public?.pdf);
if (documents.length !== 6) throw new Error('Expected exactly six November 3–6 source documents, received ' + documents.length);
const incoming = documents.filter(item => item.submission_side === 'incoming_from_state_or_public_institution');
const outgoing = documents.filter(item => item.submission_side === 'outgoing_from_user_or_alliance');
if (incoming.length !== 1 || outgoing.length !== 5 || outgoing.some(item => !item.justice_slalom?.recipients?.length)) {
  throw new Error('November documents must be registered as one Godot incoming record and five Justiční slalom submissions');
}
if (annexes.documents.length !== 10 || annexes.documents.some(item => item.parent_document_id !== annexes.parent_document_id || !item.public?.pdf)) {
  throw new Error('Ten OKTE PDFs must remain linked as annexes of the original Olomouc Police response');
}

const start = '<!-- NOVEMBER-EVIDENCE-INDEX:BEGIN -->';
const end = '<!-- NOVEMBER-EVIDENCE-INDEX:END -->';
const paths = [
  'web/index.html', 'web/en.html', 'web/kc/index.html',
  'web/kc/en.html', 'web/zpravy/04082026-010.html', 'web/news/04082026-010.html'
];
for (const path of paths) {
  let html = await readFile(path, 'utf8');
  let removed = 0;
  while (html.includes(start)) {
    const from = html.indexOf(start);
    const to = html.indexOf(end, from);
    if (to < 0) throw new Error('Unclosed legacy standalone evidence index in ' + path);
    html = html.slice(0, from) + html.slice(to + end.length);
    removed++;
  }
  if (html.includes('id="listiny-listopad-2026"') || html.includes('class="november-evidence-index"')) {
    throw new Error('Legacy standalone evidence panel remains in ' + path);
  }
  if (removed) await writeFile(path, html, 'utf8');
}
console.log('November evidence: no standalone editorial panels; 1 incoming Godot record, 5 outgoing Slalom submissions, 10 OKTE annex PDFs kept in canonical records.');
