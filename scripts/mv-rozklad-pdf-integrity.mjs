import { createHash } from 'node:crypto';
import { policyHardenedCopyOk } from './justice-slalom-pdf-provenance.mjs';

export const mvRozkladPdf = Object.freeze({
  id:'doc-cz-mv-2026-10-07-mv-134798-4-so-2026',
  path:'documents/report-04082026-010/115-mv-134798-4-so-2026-2026-10-07.pdf',
  sourceSha:'3309bb2da6053045d842ef2d9263dcdeab4fcce2d399264da08a7233f15b9366',
  sourceSize:274596,
  pages:6,
  // Independently confirmed from existing production HTTPS bytes (HTTP 200)
  // and the exact trusted artifact for main f5689922, 24 November 2026.
  // Never derive this pin from the mutable registry or hardening report.
  publicSha:'d21135cac529860b288e6c5e7812aca464193f21153d6accb3ef105302e327ce',
  publicSize:241029,
});

const sha = b => createHash('sha256').update(b).digest('hex');
const pdf = b => Buffer.isBuffer(b) && b.subarray(0,5).toString() === '%PDF-' && b.subarray(-2048).toString('latin1').includes('%%EOF');

export function verifyMvRozkladPdf({ spec = mvRozkladPdf, original, publicCopy, record, hardeningById, hardeningReportOk }) {
  const fail = () => { throw new Error('MV rozklad pinned source/public provenance mismatch'); };
  if (!pdf(original) || original.length !== spec.sourceSize || sha(original) !== spec.sourceSha) fail();
  if (!pdf(publicCopy) || publicCopy.length !== spec.publicSize || sha(publicCopy) !== spec.publicSha || spec.sourceSha === spec.publicSha) fail();
  const p = record?.public;
  if (record?.id !== spec.id || p?.pdf !== spec.path || p?.intended_pdf !== spec.path ||
      p?.source_original_sha256 !== spec.sourceSha || p?.source_original_size_bytes !== spec.sourceSize ||
      p?.source_original_page_count !== spec.pages || p?.sha256 !== spec.publicSha) fail();
  if (!policyHardenedCopyOk({doc:record,digest:spec.publicSha,expectedInputSha:spec.sourceSha,hardeningById,hardeningReportOk})) fail();
  const row = hardeningById.get(spec.id);
  if (row.registered !== true || row.page_count !== spec.pages || row.strategy !== 'redact' || row.text_fallback !== null ||
      !Array.isArray(row.redaction_matches) || !row.redaction_matches.length ||
      !row.redaction_matches.every(m => Number.isInteger(m?.page) && m.page >= 1 && m.page <= spec.pages && typeof m.rule === 'string' && m.rule.length > 0)) fail();
  return true;
}
