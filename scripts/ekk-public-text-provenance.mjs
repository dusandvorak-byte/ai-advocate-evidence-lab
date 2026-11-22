const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const parts = value => String(value || '').split(';').map(part => part.trim());

/**
 * Public copies are generated from pinned extracted text, then independently
 * scanned by the trusted privacy-hardening workflow. A clean PDF may remain
 * byte-identical to that generated copy; changed PDFs require a full SHA bridge.
 */
export function verifiedEkkPublicCopy({ sourceDoc, finalDoc, digest, report }) {
  const source = sourceDoc?.public;
  const published = finalDoc?.public;
  if (!sourceDoc?.id || sourceDoc.id !== finalDoc?.id ||
      !shaOk(source?.sha256) || !shaOk(published?.sha256) || !shaOk(digest) ||
      source.pdf !== published.pdf || digest !== published.sha256 ||
      !parts(source.verification_status).some(part => part.startsWith('verified_text_public_copy'))) return false;
  if (report?.hard_failure_count !== 0 || !Array.isArray(report?.hard_failures) ||
      report.hard_failures.length !== 0 || !Array.isArray(report?.documents)) return false;

  const rows = report.documents.filter(row => row?.id === sourceDoc.id);
  if (rows.length > 1) return false;
  const row = rows[0];
  const hardened = parts(published.verification_status).includes('publication_policy_hardened');
  if (!hardened) {
    // A verified generated text copy needs no second rewrite. Reject a
    // mismatched SHA or a contradictory changed hardening record.
    return source.sha256 === digest && (!row || (
      row.changed === false && row.public_path === source.pdf &&
      row.input_sha256 === digest && row.output_sha256 === digest
    ));
  }
  return Boolean(
    row && row.changed === true &&
    shaOk(row.input_sha256) && shaOk(row.output_sha256) &&
    row.public_path === source.pdf &&
    row.input_sha256 === source.sha256 &&
    row.output_sha256 === digest &&
    row.input_sha256 !== row.output_sha256 &&
    Array.isArray(row.known_private_identifier_hits_after) &&
    row.known_private_identifier_hits_after.length === 0 &&
    Array.isArray(row.decoded_private_identifier_hits_after) &&
    row.decoded_private_identifier_hits_after.length === 0
  );
}
