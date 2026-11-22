// Diagnostic-only: compare final public PDF bytes and canonical provenance.
// Fixed known public-document IDs only. No PDF content, policy literals or redaction matches.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ids = [
  'doc-cz-ks-brn-2026-09-03-9-to-315-2026-140',
  'doc-cz-ms-pha-2026-10-02-18-a-17-2026-191'
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
};
const registry = await readJson('project-memory/documents-2026.json');
const supplement = await readJson('project-memory/documents-2026-supplement-2026-10-03-four-records.json');
const report = await readJson('project-memory/privacy-hardening-report.json');
for (const id of ids) {
  const final = registry?.documents?.find(item => item.id === id);
  const source = supplement?.documents?.find(item => item.id === id);
  const publicData = final?.public ?? {};
  const rel = publicData.pdf;
  const out = {
    id,
    canonical_present: Boolean(final),
    supplement_present: Boolean(source),
    canonical_pdf_matches_supplement: Boolean(rel && rel === source?.public?.pdf),
    source_original_sha_matches_supplement: Boolean(publicData.source_original_sha256 && publicData.source_original_sha256 === source?.public?.source_original_sha256),
    canonical_sha256: publicData.sha256 ?? null,
    has_deterministic_text_marker: String(publicData.verification_status ?? '').includes('verified_deterministic_public_text_copy'),
    has_policy_hardened_marker: String(publicData.verification_status ?? '').includes('publication_policy_hardened'),
    has_not_byte_identical_marker: String(publicData.verification_status ?? '').includes('not_byte_identical_original')
  };
  if (rel && /^documents\/report-04082026-010\/11[01]-[^/]+\.pdf$/.test(rel)) {
    try {
      const bytes = await readFile('web/' + rel);
      const realSha = sha256(bytes);
      Object.assign(out, {
        actual_sha256: realSha,
        bytes: bytes.length,
        pdf_header: bytes.subarray(0,5).toString('ascii') === '%PDF-',
        pdf_eof_last2048: bytes.subarray(-2048).includes(Buffer.from('%%EOF')),
        actual_matches_canonical_sha: realSha === publicData.sha256
      });
      const entries = report?.documents ?? [];
      const entriesForPath = entries.filter(row => row.public_path === rel);
      out.privacy_report = {
        report_present: Boolean(report),
        report_hard_failure_count: report?.hard_failure_count ?? null,
        path_row_count: entriesForPath.length,
        changed: entriesForPath.some(row => row.changed === true),
        report_sha_matches_actual: entriesForPath.length > 0 && entriesForPath.every(row => row.output_sha256 === realSha),
        strategy: entriesForPath[0]?.strategy ?? null,
        trigger_reason_count: entriesForPath[0]?.trigger_reasons?.length ?? 0
      };
    } catch (error) {
      out.read_error_code = error?.code === 'ENOENT' ? 'FILE_MISSING' : 'READ_ERROR';
    }
  } else out.pdf_path_status = 'NOT_EXPECTED_KNOWN_PUBLIC_PATH';
  console.log('FOUR_RECORDS_PROVENANCE_DIAGNOSTIC ' + JSON.stringify(out));
}
