import { policyHardenedCopyOk } from './justice-slalom-pdf-provenance.mjs';

const SHA256 = /^[0-9a-f]{64}$/i;

// Preserve the immutable source digest from the evidence manifest while allowing
// only an authenticated privacy-hardened public derivative with a separate SHA.
export const verifiedStatePdfProvenance = ({ file, doc, digest, hardeningById, hardeningReportOk }) => {
  const sourceDigest = file?.source_sha256;
  const publicInputDigest = file?.public_sha256;
  if (!file || !doc || file.document_id !== doc.id
      || file.public_pdf !== doc.public?.pdf
      || !SHA256.test(sourceDigest || '')
      || !SHA256.test(publicInputDigest || '')
      || !SHA256.test(digest || '')
      || sourceDigest !== publicInputDigest
      || doc.public.sha256 !== digest) return false;

  if (digest === sourceDigest) return true;

  return hardeningById instanceof Map && policyHardenedCopyOk({
    doc,
    digest,
    expectedInputSha: sourceDigest,
    hardeningById,
    hardeningReportOk,
  });
};

const hasStatus = (doc, status) => String(doc?.public?.verification_status || '').split(';').map(s => s.trim()).includes(status);
const noHits = (row, key) => Array.isArray(row?.[key]) && row[key].length === 0;

// Generated source PDF is distinct from the archived binary. Both changed
// and unchanged release bytes require a registered authenticated proof row.
export const verifiedGeneratedStatePdfProvenance = ({
  sourceDoc, finalDoc, digest, originalSha, originalPages, hardeningById, hardeningReportOk,
}) => {
  const source = sourceDoc?.public;
  const final = finalDoc?.public;
  const input = source?.sha256;
  const id = sourceDoc?.id;
  if (hardeningReportOk !== true || !(hardeningById instanceof Map)
      || !id || finalDoc?.id !== id || !source?.pdf || source.pdf !== source.intended_pdf
      || final?.pdf !== source.pdf || !SHA256.test(originalSha || '') ||
      !SHA256.test(input || '') || !SHA256.test(digest || '') ||
      input === originalSha || digest === originalSha || final.sha256 !== digest ||
      source.source_original_sha256 !== originalSha || final.source_original_sha256 !== originalSha ||
      !Number.isInteger(originalPages) || originalPages <= 0 ||
      source.source_original_page_count !== originalPages || final.source_original_page_count !== originalPages ||
      !hasStatus(sourceDoc,'verified_deterministic_public_text_copy') ||
      !hasStatus(sourceDoc,'not_byte_identical_original') ||
      !hasStatus(finalDoc,'verified_deterministic_public_text_copy') ||
      !hasStatus(finalDoc,'not_byte_identical_original') ||
      !hasStatus(finalDoc,'publication_policy_hardened')) return false;
  const row = hardeningById.get(id);
  if (row?.id !== id || row.public_path !== final.pdf || row.registered !== true ||
      row.input_sha256 !== input || row.output_sha256 !== digest ||
      !Number.isInteger(row.page_count) || row.page_count <= 0 ||
      !noHits(row,'known_private_identifier_hits_after') ||
      !noHits(row,'decoded_private_identifier_hits_after')) return false;
  if (input === digest) return row.changed === false &&
    row.strategy === 'kernel_sealed_authenticated_deep_scan' &&
    noHits(row,'redaction_matches') && noHits(row,'trigger_reasons') && row.text_fallback === null;
  return policyHardenedCopyOk({doc:finalDoc,digest,expectedInputSha:input,hardeningById,hardeningReportOk});
};
