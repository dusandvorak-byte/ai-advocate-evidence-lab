const publicCopyKinds = new Set([
  'redacted_public_copy_from_user_original',
  'verified_public_copy_from_user_original',
]);
const redactedOriginalKind = 'redacted_original_from_user_binary';
const SHA256_RE = /^[0-9a-f]{64}$/i;
const DOCUMENT_ID_RE = /^doc-[a-z0-9-]+$/;
const validSha256 = value => typeof value === 'string' && SHA256_RE.test(value);


export const indexJusticeSlalomHardeningEvidence = report => {
  const rows = Array.isArray(report?.documents) ? report.documents : null;
  const rowShapesValid = rows !== null && rows.every(row => Boolean(
    row
    && typeof row === 'object'
    && Object.prototype.hasOwnProperty.call(row, 'id')
    && (row.id === null || (typeof row.id === 'string' && DOCUMENT_ID_RE.test(row.id)))
  ));
  const indexedRows = rowShapesValid
    ? rows.filter(row => typeof row.id === 'string' && row.id.length > 0)
    : [];
  const ids = indexedRows.map(row => row.id);
  const idsUnique = new Set(ids).size === ids.length;
  const reportClean = report?.hard_failure_count === 0
    && Array.isArray(report?.hard_failures)
    && report.hard_failures.length === 0;
  const hardeningReportOk = Boolean(reportClean && rowShapesValid && idsUnique);

  return {
    hardeningReportOk,
    hardeningById: hardeningReportOk
      ? new Map(indexedRows.map(row => [row.id, row]))
      : new Map(),
  };
};

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

export const policyHardenedCopyOk = ({ doc, digest, expectedInputSha, hardeningById, hardeningReportOk }) => {
  const row = hardeningById.get(doc.id);
  return Boolean(
    hardeningReportOk === true
    && hardenedRegistryStatus(doc)
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
  hardeningReportOk,
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
    hardeningReportOk,
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


export const evaluatePinnedJusticeSlalomOriginal = ({
  doc,
  digest,
  expectedSourceSha,
  hardeningById,
  hardeningReportOk,
}) => {
  const sourcePinned = Boolean(
    doc
    && doc.justice_slalom?.source_kind === 'original_pdf_uploaded_by_user'
    && validSha256(expectedSourceSha)
    && doc.justice_slalom?.source_sha256 === expectedSourceSha
  );
  const registryDigestMatches = Boolean(
    validSha256(digest)
    && digest === doc?.public?.sha256
  );
  const evaluation = doc
    ? evaluateJusticeSlalomPdfProvenance({
        doc,
        digest,
        hardeningById,
        hardeningReportOk,
        requiredInputSha: expectedSourceSha,
      })
    : {
        declaredKind: 'original',
        effectiveKind: 'original',
        expectedInputSha: expectedSourceSha,
        policyHardened: false,
        provenanceOk: false,
      };

  return {
    ...evaluation,
    sourcePinned,
    registryDigestMatches,
    provenanceOk: Boolean(
      sourcePinned
      && registryDigestMatches
      && evaluation.provenanceOk
    ),
  };
};
