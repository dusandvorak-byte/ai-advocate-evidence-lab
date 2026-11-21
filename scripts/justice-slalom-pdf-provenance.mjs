const publicCopyKinds = new Set([
  'redacted_public_copy_from_user_original',
  'verified_public_copy_from_user_original',
]);
const redactedOriginalKind = 'redacted_original_from_user_binary';
const SHA256_RE = /^[0-9a-f]{64}$/i;
const validSha256 = value => typeof value === 'string' && SHA256_RE.test(value);

export const declaredJusticeSlalomPdfKind = doc => {
  const sourceKind = doc.justice_slalom?.source_kind;
  if (sourceKind === redactedOriginalKind) return 'redacted_original';
  if (publicCopyKinds.has(sourceKind)) return 'redacted_public_copy';
  return 'original';
};

const copyManifestFor = doc => {
  const sourceKind = doc.justice_slalom?.source_kind;
  if (sourceKind === 'redacted_public_copy_from_user_original' || sourceKind === redactedOriginalKind) {
    return doc.justice_slalom?.redaction_manifest;
  }
  return doc.justice_slalom?.public_copy_manifest;
};

const hardenedRegistryStatus = doc => String(doc.public?.verification_status || '')
  .split(';')
  .map(part => part.trim())
  .includes('publication_policy_hardened');

export const policyHardenedCopyOk = ({ doc, digest, expectedInputSha, hardeningById }) => {
  const row = hardeningById.get(doc.id);
  return Boolean(
    hardenedRegistryStatus(doc)
    && validSha256(digest)
    && validSha256(expectedInputSha)
    && row
    && row.changed === true
    && validSha256(row.input_sha256)
    && validSha256(row.output_sha256)
    && row.public_path === doc.public?.pdf
    && row.input_sha256 === expectedInputSha
    && row.output_sha256 === digest
    && digest !== expectedInputSha
    && Array.isArray(row.known_private_identifier_hits_after)
    && row.known_private_identifier_hits_after.length === 0
    && Array.isArray(row.decoded_private_identifier_hits_after)
    && row.decoded_private_identifier_hits_after.length === 0
  );
};

export const evaluateJusticeSlalomPdfProvenance = ({
  doc,
  digest,
  hardeningById,
  requiredInputSha,
}) => {
  const meta = doc.justice_slalom || {};
  const declaredKind = declaredJusticeSlalomPdfKind(doc);
  const declaredInputSha = declaredKind === 'original'
    ? meta.source_sha256
    : meta.public_sha256;
  const expectedInputSha = requiredInputSha === undefined
    ? declaredInputSha
    : requiredInputSha;
  const directMatch = validSha256(digest)
    && validSha256(expectedInputSha)
    && digest === expectedInputSha;
  const policyHardened = policyHardenedCopyOk({
    doc,
    digest,
    expectedInputSha,
    hardeningById,
  });
  const copyManifest = copyManifestFor(doc);
  const provenanceOk = declaredKind === 'original'
    ? directMatch || policyHardened
    : Boolean(copyManifest) && (directMatch || policyHardened);
  const effectiveKind = policyHardened && declaredKind === 'original'
    ? 'redacted_public_copy'
    : declaredKind;

  return {
    declaredKind,
    effectiveKind,
    expectedInputSha,
    policyHardened,
    provenanceOk,
  };
};
