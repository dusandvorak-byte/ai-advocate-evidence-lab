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
