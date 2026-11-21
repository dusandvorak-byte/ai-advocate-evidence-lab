import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateJusticeSlalomPdfProvenance,
} from '../scripts/justice-slalom-pdf-provenance.mjs';

const SOURCE_SHA = '1'.repeat(64);
const PUBLIC_SHA = '2'.repeat(64);
const HARDENED_SHA = '3'.repeat(64);
const PDF_PATH = 'documents/justice-slalom/example.pdf';

const makeDoc = ({
  sourceKind = 'original_pdf_in_user_archive',
  publicSha = SOURCE_SHA,
  verificationStatus = 'source_pdf_received_binary_original',
  sourceSha = SOURCE_SHA,
  declaredPublicSha = PUBLIC_SHA,
  redactionManifest,
  publicCopyManifest,
} = {}) => ({
  id: 'doc-test',
  public: {
    pdf: PDF_PATH,
    sha256: publicSha,
    verification_status: verificationStatus,
  },
  justice_slalom: {
    source_kind: sourceKind,
    source_sha256: sourceSha,
    public_sha256: declaredPublicSha,
    ...(redactionManifest ? { redaction_manifest: redactionManifest } : {}),
    ...(publicCopyManifest ? { public_copy_manifest: publicCopyManifest } : {}),
  },
});

const hardenedRow = ({
  inputSha = SOURCE_SHA,
  outputSha = HARDENED_SHA,
  knownHits = [],
  decodedHits = [],
} = {}) => ({
  id: 'doc-test',
  changed: true,
  public_path: PDF_PATH,
  input_sha256: inputSha,
  output_sha256: outputSha,
  known_private_identifier_hits_after: knownHits,
  decoded_private_identifier_hits_after: decodedHits,
});

test('byte-identical original remains an original', () => {
  const doc = makeDoc();
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: SOURCE_SHA,
    hardeningById: new Map(),
  });

  assert.equal(result.provenanceOk, true);
  assert.equal(result.policyHardened, false);
  assert.equal(result.declaredKind, 'original');
  assert.equal(result.effectiveKind, 'original');
});

test('policy-hardened original is accepted and labelled as a public copy', () => {
  const doc = makeDoc({
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
  });
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningById: new Map([['doc-test', hardenedRow()]]),
  });

  assert.equal(result.provenanceOk, true);
  assert.equal(result.policyHardened, true);
  assert.equal(result.declaredKind, 'original');
  assert.equal(result.effectiveKind, 'redacted_public_copy');
});

test('hardened original is rejected when the report is not bound to the source digest', () => {
  const doc = makeDoc({
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
  });
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningById: new Map([['doc-test', hardenedRow({ inputSha: '9'.repeat(64) })]]),
  });

  assert.equal(result.provenanceOk, false);
  assert.equal(result.policyHardened, false);
  assert.equal(result.effectiveKind, 'original');
});

test('hardened copy is rejected when privacy hits remain', () => {
  const doc = makeDoc({
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
  });
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningById: new Map([['doc-test', hardenedRow({ decodedHits: ['private_raw_match_1'] })]]),
  });

  assert.equal(result.provenanceOk, false);
  assert.equal(result.policyHardened, false);
});

test('hardening report alone cannot reclassify a document without hardened registry status', () => {
  const doc = makeDoc({ publicSha: HARDENED_SHA });
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningById: new Map([['doc-test', hardenedRow()]]),
  });

  assert.equal(result.provenanceOk, false);
  assert.equal(result.policyHardened, false);
});

test('reviewed public copy may be hardened again without losing its copy classification', () => {
  const doc = makeDoc({
    sourceKind: 'redacted_public_copy_from_user_original',
    publicSha: HARDENED_SHA,
    verificationStatus: 'redacted_public_copy_reviewed; publication_policy_hardened',
    redactionManifest: 'project-memory/redaction-manifest.json',
  });
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningById: new Map([[
      'doc-test',
      hardenedRow({ inputSha: PUBLIC_SHA }),
    ]]),
  });

  assert.equal(result.provenanceOk, true);
  assert.equal(result.policyHardened, true);
  assert.equal(result.effectiveKind, 'redacted_public_copy');
});

test('redacted original keeps its redacted-original label after policy hardening', () => {
  const doc = makeDoc({
    sourceKind: 'redacted_original_from_user_binary',
    publicSha: HARDENED_SHA,
    verificationStatus: 'redacted_original_reviewed; publication_policy_hardened',
    redactionManifest: 'project-memory/redacted-original-manifest.json',
  });
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningById: new Map([[
      'doc-test',
      hardenedRow({ inputSha: PUBLIC_SHA }),
    ]]),
  });

  assert.equal(result.provenanceOk, true);
  assert.equal(result.policyHardened, true);
  assert.equal(result.effectiveKind, 'redacted_original');
});
