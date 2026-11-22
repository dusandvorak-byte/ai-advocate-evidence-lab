// Read-only provenance trace for the two historical interpellation PDFs.
// Never prints document contents or private redaction matches.
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const stage = process.argv[2];
if (!['checkout', 'after-recovery', 'before-hardening', 'after-hardening'].includes(stage)) {
  console.error('Usage: node scripts/diagnose-interpelace-380.mjs <checkout|after-recovery|before-hardening|after-hardening>');
  process.exit(2);
}
const paths = [
  'documents/interpelace-380-2018/interpelace-zuzana-majerova-zahradnikova-2018.pdf',
  'documents/interpelace-380-2018/odpoved-andrej-babis-interpelace-380.pdf'
];
const expected = [
  { sha256: 'e5844a961b84628bee2320e6897a4aa52efefa2b616414760655b872ab9b7a71', bytes: 2518874, pages: 2 },
  { sha256: '4a986f28d6940869026b01db7dadb36b3757e928a1e37a3c439702b12eb0ff73', bytes: 918781, pages: 3 }
];
for (let i = 0; i < paths.length; i++) {
  const file = resolve('web', paths[i]);
  const out = { stage, file: paths[i] };
  try {
    const bytes = await readFile(file);
    const metadata = await stat(file);
    let pages = null;
    try {
      const pdfinfo = execFileSync('pdfinfo', [file], { encoding: 'utf8', timeout: 10000, stdio: ['ignore','pipe','ignore'] });
      const match = pdfinfo.match(/^Pages:\s+(\d+)\s*$/m);
      pages = match ? Number(match[1]) : null;
    } catch { pages = null; }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const expectedRecord = expected[i];
    Object.assign(out, {
      bytes: metadata.size,
      sha256,
      pdf_header: bytes.subarray(0,5).toString('ascii') === '%PDF-',
      pdf_eof_last64: bytes.subarray(-64).includes(Buffer.from('%%EOF')),
      pages,
      matches_expected_sha: sha256 === expectedRecord.sha256,
      matches_expected_bytes: metadata.size === expectedRecord.bytes,
      matches_expected_pages: pages === expectedRecord.pages
    });
  } catch (error) {
    out.error_code = error?.code === 'ENOENT' ? 'MISSING' : 'READ_ERROR';
  }
  if (stage === 'after-hardening') {
    try {
      const report = JSON.parse(await readFile('project-memory/privacy-hardening-report.json', 'utf8'));
      const entries = Array.isArray(report) ? report : (report.rows ?? report.documents ?? []);
      const match = entries.find(row => row.public_path === paths[i]);
      if (match) {
        out.hardening = {
          changed: Boolean(match.changed),
          input_sha256: match.input_sha256 ?? null,
          output_sha256: match.output_sha256 ?? null,
          strategy: match.strategy ?? null,
          trigger_reason_count: Array.isArray(match.trigger_reasons) ? match.trigger_reasons.length : 0,
          redaction_match_count: Array.isArray(match.redaction_matches) ? match.redaction_matches.length : 0
        };
      } else out.hardening = { report_entry: 'NOT_FOUND' };
    } catch { out.hardening = { report_entry: 'UNAVAILABLE' }; }
  }
  console.log('INTERPELACE380_PROVENANCE ' + JSON.stringify(out));
}
