import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`EUDA-2026-10-01-GATE: ${message}`); };

const registryPath = 'project-memory/documents-2026-supplement-2026-10-01-euda-access-documents.json';
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const item = registry.documents?.find(entry => entry.id === 'doc-eu-euda-2026-10-01-access-documents-1049-2001');
if (!item) fail('chybí kanonický záznam');
if (item.issue_date !== '2026-10-01' || item.received_date !== '2026-10-01') fail('nesprávné datum vydání/doručení');
if (item.institution_id !== 'EU-EUDA' || item.document_type !== 'state_record') fail('nesprávná instituce nebo typ dokumentu');
if (item.reference !== 'bez samostatného č. j./sp. zn. v e-mailu') fail('bylo vymyšleno nebo změněno číslo jednací');
if (!item.relations?.some(rel => rel.type === 'navazuje_na' && rel.target_id === 'doc-eu-euda-2026-09-25-exo-fhp-pd-26-d-106')) fail('chybí návaznost na odpověď EUDA z 25. 9. 2026');
if (item.public?.source_original_sha256 !== 'd3a61bda167f6cbe0fc77c4e38580d9a427212210585e61ec1b4d330347cef71') fail('nesouhlasí hash nahraného zdrojového PDF');
if (!item.public?.pdf?.endsWith('/109-euda-comparability-thc-access-documents-2026-10-01-verejna-kopie.pdf')) fail('nesprávná veřejná PDF cesta');

const sourceText = await readFile('project-memory/state-text-sources-2026-10-01/euda-access-documents-2026-10-01.txt', 'utf8');
for (const phrase of ['Regulation (EC) No 1049/2001','has been registered','separate procedure','within the time limits laid down in the applicable legislation']) {
  if (!sourceText.includes(phrase)) fail(`zdrojový text neobsahuje: ${phrase}`);
}

const translations = JSON.parse(await readFile('project-memory/english-godot-translations.json', 'utf8'));
if (!translations.documents?.[item.id]) fail('chybí anglický popis dokumentu');

const older = JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-09-28-justice-slalom-august-september.json', 'utf8'));
const objection = older.documents?.find(entry => entry.id === 'doc-en-dd-2026-09-26-slalom-augsep-082');
if (!objection?.relations?.some(rel => rel.type === 'podani_na_ktere_organ_reaguje' && rel.target_id === item.id)) fail('chybí vazba na zásadní námitku k EUDA');

const pdfPath = 'web/' + item.public.pdf;
const bytes = await readFile(pdfPath);
if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF') || bytes.length < 5000) fail('veřejná PDF kopie je neúplná');
if (sha256(bytes) !== item.public.sha256) fail('SHA-256 veřejné PDF kopie neodpovídá registru');

const cz = await readFile('web/zpravy/04082026-010.html', 'utf8');
const en = await readFile('web/news/04082026-010.html', 'utf8');
if (!cz.includes(`id="${item.id}"`) || !cz.includes('EUDA potvrdila registraci samostatné žádosti o přístup k dokumentům')) fail('záznam chybí ve Státu lásky čas');
if (!cz.includes('Podání, na které orgán veřejné moci reaguje')) fail('česká chronologie nezobrazuje související zásadní námitku');
if (!en.includes(`id="en-${item.id}"`) || !en.includes('registered a separate access-to-documents request')) fail('záznam chybí v anglickém Godotovi');

console.log('EUDA 1. 10. 2026 access-to-documents gate OK.');
