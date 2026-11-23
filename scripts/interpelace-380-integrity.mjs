import { createHash } from 'node:crypto';

export const historicalOriginals = Object.freeze([
  Object.freeze({
    path: 'web/documents/interpelace-380-2018/interpelace-zuzana-majerova-zahradnikova-2018.pdf',
    originalSha: 'e5844a961b84628bee2320e6897a4aa52efefa2b616414760655b872ab9b7a71',
    originalSize: 2518874, pages: 2,
    // Verified in trusted run #45223722839 after privacy-hardening, not a source original.
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
