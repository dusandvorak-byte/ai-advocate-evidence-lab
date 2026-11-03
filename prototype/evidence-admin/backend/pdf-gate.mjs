import { createHash } from 'node:crypto';

// Phase 2: pure pre-quarantine gate. This DOES NOT replace AV / sandbox / deep PDF parsing.
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MIN_PDF_BYTES = 16;
const magic = Buffer.from('%PDF-', 'ascii');
const eof = Buffer.from('%%EOF', 'ascii');

export function inspectPdfForQuarantine(bytes, declaredMime = 'application/pdf') {
  const errors = [];
  if (!Buffer.isBuffer(bytes)) return { accepted: false, errors: ['Expected binary Buffer'] };
  if (bytes.byteLength < MIN_PDF_BYTES || bytes.byteLength > MAX_PDF_BYTES) errors.push('Invalid PDF size');
  if (declaredMime !== 'application/pdf') errors.push('Unexpected MIME type');
  if (!bytes.subarray(0, 5).equals(magic)) errors.push('Missing PDF magic');
  if (bytes.subarray(Math.max(0, bytes.length - 1024)).indexOf(eof) < 0) errors.push('Missing PDF EOF marker');
  if (errors.length) return { accepted: false, errors };
  return {
    accepted: true,
    status: 'requires_quarantine_and_malware_scan',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size_bytes: bytes.byteLength,
    errors: []
  };
}
