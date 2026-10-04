import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Terminal publication step. The timer builder still supplies internal case history
// to earlier generators; no timer card or timer script is shipped in public HTML.
const documents = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8')).documents;
const institutions = JSON.parse(await readFile('project-memory/institutions.json', 'utf8')).institutions;
const names = new Map(institutions.map(item => [item.id, item.name]));
const entries = documents.filter(item => item.justice_slalom);
const expectedArchiveNumbers = Array.from({ length: 47 }, (_, index) => index + 2);
const julyEntries = entries.filter(item => item.public?.source_manifest === 'project-memory/documents-2026-supplement-2026-09-28-justice-slalom.json' || [17,18,36].includes(item.justice_slalom.archive_number));
const actualArchiveNumbers = julyEntries.map(item => item.justice_slalom.archive_number).sort((a, b) => a - b);
if (JSON.stringify(actualArchiveNumbers) !== JSON.stringify(expectedArchiveNumbers)) {
  throw new Error(`JUSTICE-SLALOM: archiv 02–48 není přesně pokryt: ${actualArchiveNumbers.join(', ')}`);
}
const allArchiveNumbers = entries.map(item => item.justice_slalom.archive_number).sort((a, b) => a - b);
const contiguousNumbers = Array.from({ length: Math.max(...allArchiveNumbers) - 1 }, (_, index) => index + 2);
if (JSON.stringify(allArchiveNumbers) !== JSON.stringify(contiguousNumbers) || allArchiveNumbers.at(-1) < 130) {
  throw new Error(`JUSTICE-SLALOM: chybí podání z července až září nebo se opakuje archivní číslo: ${allArchiveNumbers.join(', ')}`);
}

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const publicCopyKinds = new Set(['redacted_public_copy_from_user_original', 'verified_public_copy_from_user_original']);
const originalPdf = item => !publicCopyKinds.has(item.justice_slalom.source_kind);
const root = '/ai-advocate-evidence-lab/';
const rows = [];
for (const doc of entries) {
  const meta = doc.justice_slalom;
  if (doc.submission_side !== 'outgoing_from_user_or_alliance' || doc.issue_date < '2026-07-01') {
    throw new Error(`JUSTICE-SLALOM: datum nebo původce mimo rozsah ${doc.id}`);
  }
  if (!doc.public?.pdf || !Array.isArray(meta.recipients) || !meta.recipients.length) throw new Error(`JUSTICE-SLALOM: chybí zdroj či adresát ${doc.id}`);
  const bytes = await readFile(`web/${doc.public.pdf}`);
  if (bytes.subarray(0, 5).toString() !== '%PDF-' || !bytes.subarray(-2048).toString('latin1').includes('%%EOF') || bytes.length < 1024) {
    throw new Error(`JUSTICE-SLALOM: neplatné PDF ${doc.public.pdf}`);
  }
  const copyManifest = meta.source_kind === 'redacted_public_copy_from_user_original' ? meta.redaction_manifest : meta.public_copy_manifest;
  if (sha(bytes) !== doc.public.sha256 || (originalPdf(doc) ? sha(bytes) !== meta.source_sha256 : sha(bytes) !== meta.public_sha256 || !copyManifest)) {
    throw new Error(`JUSTICE-SLALOM: veřejné PDF neodpovídá deklarovanému zdroji a typu kopie ${doc.id}`);
  }
  for (const [index, recipient] of meta.recipients.entries()) {
    if (!names.has(recipient.institution_id) || !recipient.subject_cs || !recipient.subject_en || !recipient.reference) {
      throw new Error(`JUSTICE-SLALOM: chybí úplná metadata adresáta ${doc.id}/${index}`);
    }
    rows.push({
      id: `${doc.id}--${recipient.institution_id}`, document_id: doc.id,
      archive_number: meta.archive_number, recipient_order: index,
      date: doc.issue_date, recipient_id: recipient.institution_id,
      recipient_cs: names.get(recipient.institution_id),
      recipient_en: ({
        'CZ-KPR': 'Office of the President of the Czech Republic',
        'CZ-KPR-KABINET-MANZELKY': 'Office of the President’s spouse (Eva Pavlová)',
        'CZ-PCR-KRPT': 'Moravian-Silesian Regional Police Directorate',
        'CZ-PCR-PP': 'Police Presidium of the Czech Republic',
        'CZ-OSZ-FM': 'Frýdek-Místek District Public Prosecutor’s Office',
        'CZ-PCR-KU': 'Police Criminalistics Institute',
        'CZ-KSZ-BRN': 'Brno Regional Public Prosecutor’s Office',
        'CZ-KS-OST': 'Ostrava Regional Court',
        'CZ-VSZ-OLO': 'Olomouc High Public Prosecutor’s Office',
        'CZ-MK': 'Ministry of Culture', 'CZ-MSP': 'Ministry of Justice',
        'CZ-MV': 'Ministry of the Interior',
        'CZ-MSZ-PHA': 'Prague Municipal Public Prosecutor’s Office',
        'CZ-VSZ-PHA': 'Prague High Public Prosecutor’s Office',
        'CZ-MS-PHA': 'Prague Municipal Court',
        'CZ-NSZ': 'Supreme Public Prosecutor’s Office',
        'CZ-UOOU': 'Office for Personal Data Protection',
        'CZ-OSZ-PV': 'Prostějov District Public Prosecutor’s Office',
        'CZ-OS-PRO': 'Prostějov District Court',
        'CZ-PCR-KRPO': 'Olomouc Regional Police Directorate',
        'CZ-RRTV': 'Council for Radio and Television Broadcasting',
        'CZ-CT': 'Czech Television', 'CZ-RADA-CT': 'Czech Television Council',
        'CZ-OS-PHA4': 'Prague 4 District Court',
        'CZ-UOCR': 'Czech Defence Lawyers’ Union'
      })[recipient.institution_id] || names.get(recipient.institution_id),
      role: recipient.role, reference: recipient.reference,
      subject_cs: recipient.subject_cs, subject_en: recipient.subject_en,
      pdf: doc.public.pdf, pdf_sha256: doc.public.sha256,
      pdf_kind: originalPdf(doc) ? 'original' : 'redacted_public_copy'
    });
  }
}
rows.sort((a, b) => b.date.localeCompare(a.date) || b.archive_number - a.archive_number || a.recipient_order - b.recipient_order);
rows.forEach((row, index) => { row.number = index + 1; });
if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('JUSTICE-SLALOM: duplicitní řádek adresáta');
if (entries.length < 47 || rows.length < 65) throw new Error(`JUSTICE-SLALOM: očekáváno nejméně 47 originálů a 65 adresátů, nalezeno ${entries.length}/${rows.length}`);

await writeFile('web/data/justice-slalom.json', `${JSON.stringify({ schema_version: '1.0', source: 'project-memory/documents-2026.json', filings: entries.length, rows }, null, 2)}\n`);
const buildManifestPath = 'web/data/build-manifest.json';
const buildManifest = JSON.parse(await readFile(buildManifestPath, 'utf8'));
buildManifest.justice_slalom = 'data/justice-slalom.json';
buildManifest.counts.justice_slalom_filings = entries.length;
buildManifest.counts.justice_slalom_recipient_rows = rows.length;
buildManifest.capabilities_preserved.internal_process_tracking = true;
buildManifest.capabilities_preserved.live_process_timers = false;
buildManifest.capabilities_preserved.public_numbered_filing_archive = true;
await writeFile(buildManifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`);
const dateText = (value, lang) => {
  const [y,m,d] = value.split('-').map(Number);
  return lang === 'en' ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y,m - 1,d))) : `${d}. ${m}. ${y}`;
};
const renderRow = (row, lang) => {
  const english = lang === 'en';
  const label = english ? row.subject_en : row.subject_cs;
  const recipient = english ? row.recipient_en : row.recipient_cs;
  const role = row.role === 'copy' ? (english ? 'Copy' : 'Na vědomí') : row.role === 'simultaneous' ? (english ? 'Also addressed' : 'Současně') : row.role === 'through' ? (english ? 'Via' : 'Prostřednictvím') : '';
  const pdfLabel = row.pdf_kind === 'original' ? (english ? 'Original PDF' : 'Původní PDF') : (english ? 'Public PDF copy' : 'Veřejná kopie PDF');
  return `<tr data-slalom-id="${esc(row.id)}" data-row-number="${row.number}" data-document-id="${esc(row.document_id)}" data-recipient-id="${esc(row.recipient_id)}" data-filing-date="${esc(row.date)}"><td class="slalom-number">${row.number}</td><td><time datetime="${esc(row.date)}">${esc(dateText(row.date,lang))}</time></td><td>${esc(recipient)}${role ? `<small class="slalom-role">${esc(role)}</small>` : ''}</td><td>${esc(row.reference)}</td><td>${esc(label)} <a href="${root}${esc(row.pdf)}" target="_blank" rel="noopener" aria-label="${esc(`${pdfLabel}: ${label}`)}">${pdfLabel}</a></td></tr>`;
};
const renderPanel = lang => {
  const english = lang === 'en';
  return `<section class="justice-slalom-shell home-rollup-stack home-rollup-stack-primary" aria-label="${english ? 'Justice Slalom filings' : 'Podání Justičního slalomu'}"><details id="justicni-slalom" class="home-rollup justice-slalom" data-justice-slalom><summary><span class="rollup-title">${english ? 'Justice Slalom since 1 July 2026' : 'Justiční slalom od 1. července 2026'}</span><span class="rollup-prompt">${english ? 'read as an investigation with love' : 'číst jako investigativu s láskou'}</span><span class="rollup-heart" aria-hidden="true">❤️</span><b class="rollup-action">${english ? 'Expand' : 'Rozbalit'} ↓</b></summary><div class="justice-slalom-body"><p class="justice-slalom-intro">${english ? `${entries.length} filings · ${rows.length} numbered addressee entries · since 1 July 2026. Each row has one PDF link; public copies are labeled.` : `${entries.length} podání · ${rows.length} číslovaných řádků podle adresáta · od 1. července 2026. V každém řádku je jeden odkaz na PDF; veřejné kopie jsou označeny.`}</p><div class="justice-slalom-scroll"><table><thead><tr><th scope="col">${english ? 'No.' : 'Č.'}</th><th scope="col">${english ? 'Date' : 'Datum'}</th><th scope="col">${english ? 'Addressee' : 'Adresát'}</th><th scope="col">${english ? 'Ref./case no.' : 'č. j./sp. zn.'}</th><th scope="col">${english ? 'Subject of filing' : 'Předmět podání'}</th></tr></thead><tbody>${rows.map(row => renderRow(row,lang)).join('')}</tbody></table></div></div></details></section>`;
};

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}
const primaryPages = new Map([
  ['web/index.html','cs'], ['web/en.html','en'],
  ['web/kc/index.html','cs'], ['web/kc/en.html','en'],
  ['web/zpravy/04082026-010.html','cs'], ['web/news/04082026-010.html','en']
]);
for (const file of await walk('web')) {
  let html = await readFile(file,'utf8');
  html = html.replace(/<!-- PROCESS-TIMERS:BEGIN -->[\s\S]*?<!-- PROCESS-TIMERS:END -->/g,'');
  // The release's duplicate cleanup may leave a legacy unmarked block in older sources.
  html = html.replaceAll('#procesni-casovace','#chronologie');
  if (primaryPages.has(file)) {
    html = html.replace(/<!-- JUSTICE-SLALOM:BEGIN -->[\s\S]*?<!-- JUSTICE-SLALOM:END -->/g,'');
    if (!html.includes('</nav>')) throw new Error(`JUSTICE-SLALOM: stránce ${file} chybí navigace`);
    html = html.replace('</nav>', `</nav>\n<!-- JUSTICE-SLALOM:BEGIN -->${renderPanel(primaryPages.get(file))}<!-- JUSTICE-SLALOM:END -->`);
    if (!html.includes('justice-slalom.css')) html = html.replace('</head>', `<link rel="stylesheet" href="${root}justice-slalom.css">\n</head>`);
    html = html.replace(/\s*<script\s+src="process-timers\.js"\s+defer><\/script>/g,'');
  }
  if (html.includes('data-timer-id=') || html.includes('id="procesni-casovace"') || /Živé procesní časovače|Live procedural timers/.test(html)) {
    throw new Error(`JUSTICE-SLALOM: na veřejné stránce ${file} zůstal živý časovač`);
  }
  await writeFile(file,html,'utf8');
}
console.log(`Justiční slalom: ${entries.length} podání, ${rows.length} adresátů; 6 veřejných ploch, bez karet živých časovačů.`);
