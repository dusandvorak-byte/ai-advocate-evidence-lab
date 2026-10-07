import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fail = message => { throw new Error(`STATE-RESPONSES-2026-10-07-GATE: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const supplementPath = 'project-memory/documents-2026-supplement-2026-10-07-two-state-responses.json';
const supplement = JSON.parse(await readFile(supplementPath, 'utf8'));
const docs = new Map((supplement.documents || []).map(item => [item.id, item]));
const kszId = 'doc-cz-ksz-brn-2026-10-01-1-kzn-1079-2026-41';
const pprId = 'doc-cz-pcr-pp-2026-10-07-ppr-52605-2-cj-2026-990210-pd';
if (docs.size !== 2 || !docs.has(kszId) || !docs.has(pprId)) fail('supplement musí obsahovat právě dvě očekávané listiny');
const ksz = docs.get(kszId);
const ppr = docs.get(pprId);

if (ksz.reference !== '1 KZN 1079/2026-41' || ksz.issue_date !== '2026-10-01' || ksz.received_date !== null) fail('KSZ Brno: datum, reference nebo nedoložené doručení jsou chybně');
if (ppr.reference !== 'PPR-52605-2/ČJ-2026-990210-PD' || ppr.issue_date !== '2026-10-07' || ppr.received_date !== null) fail('Policejní prezidium: datum, reference nebo nedoložené doručení jsou chybně');
for (const item of [ksz, ppr]) {
  if (item.document_type !== 'state_record' || item.submission_side !== 'incoming_from_state_or_public_institution') fail(item.id + ': listina musí být příchozí státní záznam');
}

const kszSources = [
  'doc-cz-dd-2026-07-27-slalom-08',
  'doc-cs-dd-2026-08-24-slalom-augsep-015',
  'doc-cs-dd-2026-09-03-slalom-augsep-016',
  'doc-cz-dd-2026-09-13-ks-ksz-vsz-doplneni-stiznosti',
];
for (const id of kszSources) if (!ksz.relations?.some(rel => rel.type === 'reakce_na' && rel.target_id === id)) fail('KSZ Brno: chybí vazba reakce_na na ' + id);
if (ppr.relations?.some(rel => rel.type === 'reakce_na')) fail('Policejní prezidium: bez originálu podání z 6. 10. se nesmí vymýšlet přímá vazba reakce_na');
if (!ppr.relations?.some(rel => rel.target_id === 'doc-cz-gibs-2026-09-08-gi-3794-4-cj-2026-840502-p')) fail('Policejní prezidium: chybí vazba na předchozí krok GIBS');
if (!ppr.relations?.some(rel => rel.target_id === 'doc-cz-osz-pro-2026-07-28-zn-4-2026-6')) fail('Policejní prezidium: chybí vazba na OSZ Prostějov ZN 4/2026-6');

if (!String(ppr.evidence_note || '').includes('6. října 2026') || !String(ppr.evidence_note || '').includes('6. října 2024') || !String(ppr.evidence_note || '').includes('není redakčně opravován')) fail('Policejní prezidium: zdrojový rozpor 2026/2024 musí zůstat výslovně zachován');

const originals = {
  [kszId]: 'f21487295ab845769b9e4a610c7d5fce4f9e7446c3cdc42af8094cf81bdd9f4e',
  [pprId]: '796deaddb0723757a023dd27d2f88fc97ef525a7a653ebad1da15c4ee38f2c68',
};
const originalPages = { [kszId]: 3, [pprId]: 2 };
for (const item of [ksz, ppr]) {
  if (item.public?.source_original_sha256 !== originals[item.id]) fail(item.id + ': nesouhlasí SHA-256 nahraného originálu');
  if (item.public?.source_original_page_count !== originalPages[item.id]) fail(item.id + ': chybí správný počet stran nahraného originálu');
  if (!item.public?.pdf || item.public.pdf !== item.public.intended_pdf) fail(item.id + ': veřejná PDF cesta není materializována podle intended_pdf');
  if (!String(item.public.verification_status || '').includes('verified_deterministic_public_text_copy') || !String(item.public.verification_status || '').includes('not_byte_identical_original')) fail(item.id + ': provenance veřejné kopie je neúplná');
  const bytes = await readFile('web/' + item.public.pdf);
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF') || bytes.length < 4000 || sha256(bytes) !== item.public.sha256) fail(item.id + ': veřejná textová PDF kopie je neúplná nebo má chybný hash');
}

const sources = JSON.parse(await readFile('project-memory/document-sources.json', 'utf8'));
if (!sources.sources?.some(source => source.path === supplementPath && source.role === 'batch' && source.batch_date === '2026-10-07')) fail('nový supplement není v závazném document-sources manifestu');

const cases = JSON.parse(await readFile('project-memory/cases.json', 'utf8'));
const kszCase = cases.cases?.find(item => item.id === 'CASE-CZ-KSZ-BRN-1KZN1079-2026');
if (kszCase?.status !== 'supervisory_request_dismissed' || kszCase?.decided_on !== '2026-10-01' || kszCase?.decision_document_id !== kszId) fail('1 KZN 1079/2026 není uzavřen rozhodnou listinou 1 KZN 1079/2026-41');
if (kszCase?.next_due_on || kszCase?.deadline_note) fail('uzavřený přezkum KSZ nesmí dál nést budoucí termín 9. 10.');
const mszCase = cases.cases?.find(item => item.id === 'CASE-CZ-MSZ-BRN-3ZN140-2026');
if (mszCase?.status !== 'supervisory_review_concluded' || mszCase?.decision_document_id !== kszId) fail('3 ZN 140/2026 nemá promítnut výsledek navazujícího dohledu');
const policeCase = cases.cases?.find(item => item.id === 'case-cz-pcr-ku-interni-prezkum');
if (policeCase?.status !== 'active' || policeCase?.latest_state_document_id !== pprId) fail('interní policejní přezkum nemá aktuální procesní uzel 7. 10. 2026');

for (const path of ['project-memory/process-timers.json', 'project-memory/process-timer-overrides.json']) {
  const json = JSON.parse(await readFile(path, 'utf8'));
  const list = path.endsWith('process-timers.json') ? (json.timers || []) : (json.patches || []);
  if (list.some(item => item.id === 'timer-review-ksz-brno-1kzn1079-2026')) fail('uzavřený KSZ timer zůstal v ' + path);
}
const generatedTimers = JSON.parse(await readFile('web/data/process-timers.json', 'utf8'));
if (generatedTimers.timers?.some(item => item.id === 'timer-review-ksz-brno-1kzn1079-2026')) fail('uzavřený KSZ timer se vrátil do konečného procesního registru');
const policeTimer = generatedTimers.timers?.find(item => item.id === 'timer-review-pcr-ku-2026-05-27');
if (!policeTimer || policeTimer.status !== 'active') fail('policejní interní přezkum musí zůstat aktivní');
if (!String(policeTimer.process_history || '').includes('2026-10-07') || !String(policeTimer.process_history || '').includes('PPR-52605-2/ČJ-2026-990210-PD')) fail('policejní timer neobsahuje procesní krok Policejního prezidia ze 7. 10.');
if (policeTimer.current_source_document_id !== pprId) fail('policejní timer nemá jako aktuální zdroj listinu ze 7. 10.');

const translations = JSON.parse(await readFile('project-memory/english-godot-translations.json', 'utf8'));
for (const id of [kszId, pprId]) if (!translations.documents?.[id]) fail('chybí EN překlad ' + id);

const cz = await readFile('web/zpravy/04082026-010.html', 'utf8');
const en = await readFile('web/news/04082026-010.html', 'utf8');
for (const item of [ksz, ppr]) {
  if (!cz.includes(`<tr id="${item.id}"`)) fail('CZ Státu lásky čas neobsahuje ' + item.id);
  if (!en.includes(`id="en-${item.id}"`)) fail('EN Státu lásky čas neobsahuje ' + item.id);
  if (!cz.includes(item.public.pdf) || !en.includes(item.public.pdf)) fail('CZ/EN Státu lásky čas nemá PDF odkaz ' + item.id);
}
const kszStart = cz.indexOf(`<tr id="${kszId}"`);
const kszEnd = kszStart < 0 ? -1 : cz.indexOf('</tr>', kszStart);
const kszRow = kszStart >= 0 && kszEnd >= 0 ? cz.slice(kszStart, kszEnd + 5) : '';
for (const id of kszSources) if (!kszRow.includes(`data-related-document-id="${id}"`)) fail('KSZ řádek Státu lásky čas neukazuje podání, na které reaguje: ' + id);
const pprStart = cz.indexOf(`<tr id="${pprId}"`);
const pprEnd = pprStart < 0 ? -1 : cz.indexOf('</tr>', pprStart);
const pprRow = pprStart >= 0 && pprEnd >= 0 ? cz.slice(pprStart, pprEnd + 5) : '';
if (/data-related-document-id="[^"]*2026-10-06[^"]*"/.test(pprRow)) fail('Policejní řádek obsahuje vymyšlenou přímou vazbu na nedoložené podání 6. 10.');
for (const html of [cz, en]) {
  if (html.includes('data-timer-id="timer-review-ksz-brno-1kzn1079-2026"')) fail('uzavřený KSZ timer se vrátil do finálního HTML');
  if (!html.includes('data-timer-id="timer-review-pcr-ku-2026-05-27"') || !html.includes('PPR-52605-2/ČJ-2026-990210-PD')) fail('finální HTML nemá aktualizovanou aktivní policejní genealogii');
}

console.log('Dvě institucionální odpovědi 1./7. 10. 2026: provenance PDF, CZ/EN Státu lásky čas, uzavření KSZ přezkumu a pokračující policejní genealogie jsou konzistentní.');
