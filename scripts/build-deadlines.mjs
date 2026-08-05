import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const source = 'project-memory/deadlines.json';
const target = 'web/data/deadlines.json';
const articlePath = 'web/zpravy/04082026-010.html';
const documentsPath = 'project-memory/documents-2026.json';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatDate = value => {
  if (!value) return 'neuvedeno';
  const [year, month, day] = value.split('-');
  return `${Number(day)}. ${Number(month)}. ${year}`;
};

await mkdir('web/data', { recursive: true });
await copyFile(source, target);

const registry = JSON.parse(await readFile(source, 'utf8'));
const documents = JSON.parse(await readFile(documentsPath, 'utf8'));
if (!Array.isArray(registry.deadlines)) throw new Error('deadlines.json neobsahuje pole deadlines');
if (!Array.isArray(documents.documents)) throw new Error('documents-2026.json neobsahuje pole documents');

const documentIds = new Set(documents.documents.map(item => item.id));
const today = new Date();
today.setHours(0, 0, 0, 0);

const calculateStatus = item => {
  if (item.response_document_id) {
    if (!item.response_date || !item.due_date) return 'closed_without_deadline';
    return item.response_date <= item.due_date ? 'answered_on_time' : 'answered_late';
  }
  if (!item.due_date) return 'closed_without_deadline';
  const due = new Date(`${item.due_date}T00:00:00`);
  return due < today ? 'overdue_unanswered' : 'running';
};

const labels = {
  running: 'Lhůta běží',
  answered_on_time: 'Odpovězeno včas',
  answered_late: 'Odpovězeno po lhůtě',
  overdue_unanswered: 'Po lhůtě bez odpovědi',
  closed_without_deadline: 'Bez určené běžící lhůty'
};

const sorted = registry.deadlines.map(item => {
  if (!item.id || !item.trigger_document_id || !item.responsible_institution_id) {
    throw new Error(`Neúplná položka lhůty: ${JSON.stringify(item)}`);
  }
  if (!documentIds.has(item.trigger_document_id)) throw new Error(`Lhůta ${item.id} odkazuje na neexistující dokument ${item.trigger_document_id}`);
  if (item.response_document_id && !documentIds.has(item.response_document_id)) throw new Error(`Lhůta ${item.id} odkazuje na neexistující odpověď ${item.response_document_id}`);
  return { ...item, computed_status: calculateStatus(item) };
}).sort((a, b) => String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31')));

const rows = sorted.length ? sorted.map(item => {
  const response = item.response_document_id
    ? `<a href="#${escapeHtml(item.response_document_id)}">odpověď ${escapeHtml(formatDate(item.response_date))}</a>`
    : 'dosud bez evidované odpovědi';
  return `<tr class="deadline-${escapeHtml(item.computed_status)}"><td>${escapeHtml(labels[item.computed_status])}</td><td>${escapeHtml(item.responsible_institution_id)}</td><td><a href="#${escapeHtml(item.trigger_document_id)}">${escapeHtml(item.title || item.trigger_document_id)}</a></td><td>${escapeHtml(formatDate(item.start_date))}</td><td>${escapeHtml(formatDate(item.due_date))}</td><td>${response}</td></tr>`;
}).join('') : '<tr><td colspan="6">Lhůty budou doplňovány z rejstříku při evidenci opravných prostředků a podání.</td></tr>';

const section = `<section id="lhuty-a-necinnost" class="deadlines"><h2>Lhůty a nečinnost</h2><p>Stav se při každém nasazení automaticky přepočítává podle evidovaného počátku, konce lhůty a doručené odpovědi.</p><table><thead><tr><th>Stav</th><th>Odpovědný orgán</th><th>Podání nebo opravný prostředek</th><th>Počátek</th><th>Konec lhůty</th><th>Odpověď</th></tr></thead><tbody>${rows}</tbody></table></section>`;

let article = await readFile(articlePath, 'utf8');
article = article.replace(/<section id="lhuty-a-necinnost"[\s\S]*?<\/section>/, '');
const marker = '<p><b>Anonymizační axiom:</b>';
if (!article.includes(marker)) throw new Error('V článku chybí místo pro vložení sekce lhůt');
article = article.replace(marker, `${section}\n${marker}`);
await writeFile(articlePath, article, 'utf8');
await writeFile(target, JSON.stringify({ ...registry, generated_at: new Date().toISOString(), deadlines: sorted }, null, 2), 'utf8');

console.log(`Lhůty vytvořeny: ${sorted.length}; po lhůtě bez odpovědi: ${sorted.filter(item => item.computed_status === 'overdue_unanswered').length}.`);
