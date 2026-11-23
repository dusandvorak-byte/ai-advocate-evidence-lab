// Candidate-only manifest contract for the standalone publication workstream.
// This module does not write gh-pages or authorize any release.
const hex = /^[a-f0-9]{64}$/;
const doc = /^doc-[a-z0-9-]{4,180}$/;
const batch = /^[a-z0-9][a-z0-9-]{4,79}$/;
const path = /^documents\/[a-zA-Z0-9_./-]+\.pdf$/;
const allowedIssuers = new Set(['state', 'user', 'alliance', 'other']);
const fail = message => { throw new Error('PUBLICATION_MANIFEST_INVALID: ' + message); };
const fields = (x, required, label) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) fail(label + ': not an object');
  for (const key of required) if (!Object.hasOwn(x, key)) fail(label + ': missing ' + key);
  for (const key of Object.keys(x)) if (!required.includes(key)) fail(label + ': unknown ' + key);
};
export function validatePublicationBatch(manifest) {
  fields(manifest, ['schema_version','batch_id','items'], 'manifest');
  if (manifest.schema_version !== '1' || typeof manifest.batch_id !== 'string' || !batch.test(manifest.batch_id)) fail('schema/batch');
  if (!Array.isArray(manifest.items) || !manifest.items.length || manifest.items.length > 100) fail('items');
  const ids = new Set(), paths = new Set();
  for (const x of manifest.items) {
    fields(x, ['document_id','issuer','case_ids','source_original_sha256',
      'public_sha256','public_path','privacy_review','approval'], 'item');
    if (typeof x.document_id !== 'string' || !doc.test(x.document_id) || ids.has(x.document_id)) fail('document identity');
    ids.add(x.document_id);
    if (!allowedIssuers.has(x.issuer)) fail('issuer');
    if (!Array.isArray(x.case_ids) || x.case_ids.some(v => typeof v !== 'string' || !v) ||
      new Set(x.case_ids).size !== x.case_ids.length) fail('case_ids');
    if (typeof x.source_original_sha256 !== 'string' || typeof x.public_sha256 !== 'string' ||
      !hex.test(x.source_original_sha256) || !hex.test(x.public_sha256)) fail('SHA');
    if (typeof x.public_path !== 'string' || !path.test(x.public_path) || x.public_path.includes('//') ||
      x.public_path.split('/').some(v => v === '..' || v === '.') ||
      paths.has(x.public_path)) fail('public path');
    paths.add(x.public_path);
    fields(x.privacy_review, ['decision','reviewer','receipt','reviewed_public_sha256'], 'privacy');
    if (typeof x.privacy_review.reviewed_public_sha256 !== 'string' ||
      x.privacy_review.reviewed_public_sha256 !== x.public_sha256 ||
      x.privacy_review.decision !== 'approved_for_publication' ||
      typeof x.privacy_review.reviewer !== 'string' || !x.privacy_review.reviewer.trim() ||
      typeof x.privacy_review.receipt !== 'string' || !x.privacy_review.receipt.trim()) fail('privacy decision');
    fields(x.approval, ['authorized_public_sha256','authorized_by','receipt'], 'approval');
    if (typeof x.approval.authorized_public_sha256 !== 'string' ||
      x.approval.authorized_public_sha256 !== x.public_sha256 ||
      typeof x.approval.authorized_by !== 'string' || !x.approval.authorized_by.trim() ||
      typeof x.approval.receipt !== 'string' || !x.approval.receipt.trim()) fail('exact public SHA approval');
  }
  return { batch_id: manifest.batch_id, count: ids.size };
}
