import { createHash } from 'node:crypto';

export const historicalOriginals = Object.freeze([
  Object.freeze({
    path: 'web/documents/interpelace-380-2018/interpelace-zuzana-majerova-zahradnikova-2018.pdf',
    originalSha: 'e5844a961b84628bee2320e6897a4aa52efefa2b616414760655b872ab9b7a71',
    originalSize: 2518874, pages: 2,
    // Independently repeated in trusted runs #45223722839 and #45365840137; not an archived source.
    publicSha: 'cef92c2a2ad3188c4ec7e071e01aad46e6230a850a8da0652b15dd97efc7f53a',
    publicSize: 2519002,
  }),
  Object.freeze({
    path: 'web/documents/interpelace-380-2018/odpoved-andrej-babis-interpelace-380.pdf',
    originalSha: '4a986f28d6940869026b01db7dadb36b3757e928a1e37a3c439702b12eb0ff73',
    originalSize: 918781, pages: 3,
    publicSha: '4a986f28d6940869026b01db7dadb36b3757e928a1e37a3c439702b12eb0ff73',
    publicSize: 918781,
  }),
]);

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyHistoricPdfIdentity(spec, original, publicCopy) {
  if (!Buffer.isBuffer(original) || !Buffer.isBuffer(publicCopy)) throw new Error('PDF bytes missing');
  const formatOk = bytes => bytes.subarray(0, 5).toString() === '%PDF-' &&
    bytes.subarray(-2048).toString('latin1').includes('%%EOF');
  if (!formatOk(original) || original.length !== spec.originalSize ||
      digest(original) !== spec.originalSha) throw new Error('Archived original identity mismatch: ' + spec.path);
  if (!formatOk(publicCopy) || publicCopy.length !== spec.publicSize ||
      digest(publicCopy) !== spec.publicSha) throw new Error('Pinned public PDF identity mismatch: ' + spec.path);
  // A hardening rewrite is never mislabeled as a byte-identical source original.
  return Object.freeze({
    originalSha: spec.originalSha,
    publicSha: spec.publicSha,
    alteredPublicCopy: spec.publicSha !== spec.originalSha,
    pages: spec.pages,
  });
}

// Check the actual hardened primary PDF against independent pins, canonical ownership,
// and a clean, registered hardening row; mutable registry/report alone cannot authorize bytes.
export function verifyHistoricPrimaryProvenance(spec, record, row) {
  const fail = () => { throw new Error('Historical primary PDF provenance mismatch'); };
  const id = 'doc-cz-psp-2018-12-17-interpelace-380';
  const pub = record?.public;
  if (record?.id !== id || pub?.pdf !== spec.path.slice(4)
      || pub?.source_original_sha256 !== spec.originalSha
      || pub?.source_original_size_bytes !== spec.originalSize
      || pub?.source_original_page_count !== spec.pages
      || pub?.sha256 !== spec.publicSha
      || !String(pub?.verification_status || '').includes('publication_policy_hardened')) fail();
  if (row?.id !== id || row?.public_path !== pub.pdf || row?.registered !== true
      || row?.changed !== true || row?.input_sha256 !== spec.originalSha
      || row?.output_sha256 !== spec.publicSha || row?.page_count !== spec.pages
      || row?.strategy !== 'pymupdf_rewrite' || row?.text_fallback
      || !Array.isArray(row?.redaction_matches) || row.redaction_matches.length
      || !Array.isArray(row?.known_private_identifier_hits_after) || row.known_private_identifier_hits_after.length
      || !Array.isArray(row?.decoded_private_identifier_hits_after) || row.decoded_private_identifier_hits_after.length) fail();
  return true;
}
