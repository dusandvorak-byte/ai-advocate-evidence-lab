import { readFile } from 'node:fs/promises';

const fail = message => { throw new Error(`EU-OMB-2026-09-28-GATE: ${message}`); };
const id = 'doc-eu-omb-2026-09-28-complaint-form-required';
const caseId = 'case-eu-omb-euda-thc-comparability-2026';
const enComplaint = 'doc-en-dd-2026-09-27-slalom-augsep-081';
const csComplaint = 'doc-cs-dd-2026-09-27-slalom-augsep-083';

const docs = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8')).documents;
const cases = JSON.parse(await readFile('project-memory/cases.json', 'utf8')).cases;
const slalom = JSON.parse(await readFile('web/data/justice-slalom.json', 'utf8'));
const cz = await readFile('web/zpravy/04082026-010.html', 'utf8');
const en = await readFile('web/news/04082026-010.html', 'utf8');

const d = docs.find(x => x.id === id);
if (!d) fail('chybí kanonický záznam');
if (d.issue_date !== '2026-09-28' || d.received_date !== '2026-09-28') fail('nesprávné datum');
if (d.institution_id !== 'EU-OMB' || d.document_type !== 'state_record') fail('nesprávná instituce nebo typ');
if (d.submission_side !== 'incoming_from_state_or_public_institution') fail('nesprávná klasifikace');
if (!d.case_ids?.includes(caseId)) fail('chybí procesní větev');
if (!d.relations?.some(r => r.type === 'reakce_na' && r.target_id === enComplaint)) fail('chybí vazba na anglickou stížnost');
if (!d.relations?.some(r => r.type === 'navazuje_na' && r.target_id === csComplaint)) fail('chybí vazba na české znění');
if (d.public?.pdf) fail('veřejný záznam nemá publikovat neověřený veřejný PDF artefakt');

for (const complaintId of [enComplaint, csComplaint]) {
  const complaint = docs.find(x => x.id === complaintId);
  if (!complaint?.case_ids?.includes(caseId)) fail(`stížnost není v procesní větvi: ${complaintId}`);
}
const c = cases.find(x => x.id === caseId);
if (!c || c.institution_id !== 'EU-OMB' || c.opened_on !== '2026-09-27' || c.last_filing_document_id !== id) fail('procesní větev není úplná');

if (!cz.includes(`id="${id}"`) || !cz.includes('Evropský ombudsman')) fail('český Stát lásky čas neobsahuje záznam');
if (!en.includes(`id="en-${id}"`) || !en.includes('European Ombudsman')) fail('anglický Godot neobsahuje záznam');
if (slalom.rows.some(x => x.document_id === id)) fail('příchozí odpověď ombudsmana nesmí být položkou Justičního slalomu');

console.log('Evropský ombudsman 28. 9. 2026 OK: procesní odpověď, vazba na stížnost, case a CZ/EN Godot.');
