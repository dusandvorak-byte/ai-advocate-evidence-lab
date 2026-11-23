import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
  evaluateJusticeSlalomPdfProvenance,
  evaluatePinnedJusticeSlalomOriginal,
  indexJusticeSlalomHardeningEvidence,
} from '../scripts/justice-slalom-pdf-provenance.mjs';

const SOURCE_SHA = '1'.repeat(64);
const PUBLIC_SHA = '2'.repeat(64);
const HARDENED_SHA = '3'.repeat(64);
const PDF_PATH = 'documents/justice-slalom/example.pdf';
const POLICY_IDENTITY = 'a'.repeat(64);

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
    hardeningReportOk: true,
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
    hardeningReportOk: true,
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
    hardeningReportOk: true,
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
    hardeningReportOk: true,
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
    hardeningReportOk: true,
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
    hardeningReportOk: true,
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
    hardeningReportOk: true,
    hardeningById: new Map([[
      'doc-test',
      hardenedRow({ inputSha: PUBLIC_SHA }),
    ]]),
  });

  assert.equal(result.provenanceOk, true);
  assert.equal(result.policyHardened, true);
  assert.equal(result.effectiveKind, 'redacted_original');
});

test('missing input SHA cannot authorize hardening', () => {
  const doc = makeDoc({
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
  });
  delete doc.justice_slalom.source_sha256;
  const row = hardenedRow();
  delete row.input_sha256;

  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningReportOk: true,
    hardeningById: new Map([['doc-test', row]]),
  });

  assert.equal(result.policyHardened, false);
  assert.equal(result.provenanceOk, false);
  assert.equal(result.effectiveKind, 'original');
});

test('string changed flag cannot authorize hardening', () => {
  const doc = makeDoc({
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
  });
  const row = hardenedRow();
  row.changed = 'false';

  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningReportOk: true,
    hardeningById: new Map([['doc-test', row]]),
  });

  assert.equal(result.policyHardened, false);
  assert.equal(result.provenanceOk, false);
});

test('byte-identical original remains original despite malformed hardening row', () => {
  const doc = makeDoc({
    publicSha: SOURCE_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
  });
  const row = hardenedRow({ inputSha: SOURCE_SHA, outputSha: SOURCE_SHA });

  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: SOURCE_SHA,
    hardeningReportOk: true,
    hardeningById: new Map([['doc-test', row]]),
  });

  assert.equal(result.provenanceOk, true);
  assert.equal(result.policyHardened, false);
  assert.equal(result.effectiveKind, 'original');
});

test('upload inventory SHA override rejects a mismatched hardening input', () => {
  const inventorySha = PUBLIC_SHA;
  const tamperedCanonicalInput = '4'.repeat(64);
  const doc = makeDoc({
    sourceKind: 'redacted_public_copy_from_user_original',
    publicSha: HARDENED_SHA,
    declaredPublicSha: tamperedCanonicalInput,
    verificationStatus: 'redacted_public_copy_reviewed; publication_policy_hardened',
    redactionManifest: 'project-memory/redaction-manifest.json',
  });
  const row = hardenedRow({ inputSha: inventorySha, outputSha: HARDENED_SHA });

  const inventoryBound = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningReportOk: true,
    hardeningById: new Map([['doc-test', row]]),
    requiredInputSha: inventorySha,
  });
  const wrongInventory = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningReportOk: true,
    hardeningById: new Map([['doc-test', row]]),
    requiredInputSha: '5'.repeat(64),
  });

  assert.equal(inventoryBound.provenanceOk, true);
  assert.equal(inventoryBound.policyHardened, true);
  assert.equal(wrongInventory.provenanceOk, false);
  assert.equal(wrongInventory.policyHardened, false);
});

test('report-level hard failure blocks hardened derivative', () => {
  const doc = makeDoc({
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
  });
  const result = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningReportOk: false,
    hardeningById: new Map([['doc-test', hardenedRow()]]),
  });

  assert.equal(result.policyHardened, false);
  assert.equal(result.provenanceOk, false);
  assert.equal(result.effectiveKind, 'original');
});


test('pinned uploaded original accepts an authenticated hardened derivative', () => {
  const doc = makeDoc({
    sourceKind: 'original_pdf_uploaded_by_user',
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
    sourceSha: SOURCE_SHA,
  });
  const result = evaluatePinnedJusticeSlalomOriginal({
    doc,
    digest: HARDENED_SHA,
    expectedSourceSha: SOURCE_SHA,
    hardeningReportOk: true,
    hardeningById: new Map([['doc-test', hardenedRow()]]),
  });

  assert.equal(result.sourcePinned, true);
  assert.equal(result.registryDigestMatches, true);
  assert.equal(result.provenanceOk, true);
  assert.equal(result.effectiveKind, 'redacted_public_copy');
});

test('pinned uploaded original rejects a mismatched authenticated source SHA', () => {
  const doc = makeDoc({
    sourceKind: 'original_pdf_uploaded_by_user',
    publicSha: HARDENED_SHA,
    verificationStatus: 'source_pdf_received_binary_original; publication_policy_hardened',
    sourceSha: SOURCE_SHA,
  });
  const result = evaluatePinnedJusticeSlalomOriginal({
    doc,
    digest: HARDENED_SHA,
    expectedSourceSha: '9'.repeat(64),
    hardeningReportOk: true,
    hardeningById: new Map([['doc-test', hardenedRow()]]),
  });

  assert.equal(result.sourcePinned, false);
  assert.equal(result.provenanceOk, false);
});


// Regression for the 2 Oct FTV Prima and 4 Oct NCOZ/MS Praha documents:
// the archive retains the uploaded binary SHA, while the public bytes can
// differ ONLY after the authenticated privacy report binds input and output.
test('four-record uploaded originals accept only exact source-bound privacy derivatives', () => {
  const uploaded = [
    ['doc-cz-ekk-2026-10-02-os-praha10-ftv-prima-doplneni-zaloby', '483f849dbe816df2bfaac7b8d7a5b7be2dc2a796b711c7aec9c880fc34f6a457'],
    ['doc-cz-dd-2026-10-04-ncoz-ms-pha-18-a-17-reakce', '3dd1854522b5bcb9d0f87f9d14f199881915e80bc91a9850a04ac404f33981a2'],
  ];
  for (const [id, sourceSha] of uploaded) {
    const doc = {
      ...makeDoc({
        sourceKind: 'original_pdf_uploaded_by_user',
        publicSha: HARDENED_SHA,
        sourceSha,
        verificationStatus: 'published; publication_policy_hardened',
      }),
      id,
    };
    const row = { ...hardenedRow({ inputSha: sourceSha }), id };
    const authenticatedReport = {
      hard_failure_count: 0, hard_failures: [],
      authenticated_private_policy_identity: POLICY_IDENTITY,
      documents: [row],
    };
    const evidence = indexJusticeSlalomHardeningEvidence(
      authenticatedReport, { expectedAuthenticatedPolicyIdentity: POLICY_IDENTITY },
    );
    assert.equal(evidence.hardeningReportOk, true, id + ': report identity matches binding policy');
    for (const invalidIdentity of [undefined, null, '', 'b'.repeat(64)]) {
      const badReport = { ...authenticatedReport, authenticated_private_policy_identity: invalidIdentity };
      const invalid = indexJusticeSlalomHardeningEvidence(
        badReport, { expectedAuthenticatedPolicyIdentity: POLICY_IDENTITY },
      );
      assert.equal(invalid.hardeningReportOk, false, id + ': unauthenticated report denied');
      assert.equal(evaluatePinnedJusticeSlalomOriginal({
        doc, digest: HARDENED_SHA, expectedSourceSha: sourceSha,
        ...invalid,
      }).provenanceOk, false, id + ': unauthenticated derivative denied');
    }
    const wrongPolicy = indexJusticeSlalomHardeningEvidence(
      authenticatedReport, { expectedAuthenticatedPolicyIdentity: 'b'.repeat(64) },
    );
    assert.equal(wrongPolicy.hardeningReportOk, false, id + ': wrong binding identity denied');
    const proof = evaluatePinnedJusticeSlalomOriginal({
      doc, digest: HARDENED_SHA, expectedSourceSha: sourceSha,
      ...evidence,
    });
    assert.equal(proof.provenanceOk, true, id);
    assert.equal(proof.effectiveKind, 'redacted_public_copy', id);
    assert.equal(evaluatePinnedJusticeSlalomOriginal({
      doc, digest: HARDENED_SHA, expectedSourceSha: sourceSha,
      hardeningById: new Map(), hardeningReportOk: true,
    }).provenanceOk, false, id + ': missing report must fail');
    assert.equal(evaluatePinnedJusticeSlalomOriginal({
      doc, digest: HARDENED_SHA, expectedSourceSha: sourceSha,
      hardeningById: new Map([[id, { ...row, known_private_identifier_hits_after: ['synthetic-private-hit'] }]]),
      hardeningReportOk: true,
    }).provenanceOk, false, id + ': privacy match must fail');
    assert.equal(evaluatePinnedJusticeSlalomOriginal({
      doc, digest: HARDENED_SHA, expectedSourceSha: '9'.repeat(64),
      ...evidence,
    }).provenanceOk, false, id + ': substituted original SHA must fail');
  }
});

test('duplicate hardening evidence IDs fail closed', () => {
  const first = hardenedRow();
  const second = { ...hardenedRow(), output_sha256: '4'.repeat(64) };
  const result = indexJusticeSlalomHardeningEvidence({
    hard_failure_count: 0,
    hard_failures: [],
    documents: [first, second],
  });

  assert.equal(result.hardeningReportOk, false);
  assert.equal(result.hardeningById.size, 0);
});

test('unique clean hardening evidence is indexed', () => {
  const result = indexJusticeSlalomHardeningEvidence({
    hard_failure_count: 0,
    hard_failures: [],
    documents: [hardenedRow()],
  });

  assert.equal(result.hardeningReportOk, true);
  assert.equal(result.hardeningById.size, 1);
  assert.equal(result.hardeningById.get('doc-test').output_sha256, HARDENED_SHA);
});


test('unregistered evidence rows without IDs remain non-authoritative', () => {
  const result = indexJusticeSlalomHardeningEvidence({
    hard_failure_count: 0,
    hard_failures: [],
    documents: [
      hardenedRow(),
      {
        id: null,
        changed: true,
        public_path: 'documents/unregistered.pdf',
        input_sha256: '5'.repeat(64),
        output_sha256: '6'.repeat(64),
        known_private_identifier_hits_after: [],
        decoded_private_identifier_hits_after: [],
      },
    ],
  });

  assert.equal(result.hardeningReportOk, true);
  assert.equal(result.hardeningById.size, 1);
  assert.equal(result.hardeningById.has(null), false);
});


test('hardening evidence row without an ID field fails closed', () => {
  const malformed = { ...hardenedRow() };
  delete malformed.id;
  const result = indexJusticeSlalomHardeningEvidence({
    hard_failure_count: 0,
    hard_failures: [],
    documents: [hardenedRow(), malformed],
  });

  assert.equal(result.hardeningReportOk, false);
  assert.equal(result.hardeningById.size, 0);
});


test('malformed concrete hardening evidence IDs fail closed', () => {
  for (const malformedId of [' ', 'not-a-document-id', 'doc-OK']) {
    const malformed = { ...hardenedRow(), id: malformedId };
    const result = indexJusticeSlalomHardeningEvidence({
      hard_failure_count: 0,
      hard_failures: [],
      documents: [hardenedRow(), malformed],
    });

    assert.equal(result.hardeningReportOk, false, malformedId);
    assert.equal(result.hardeningById.size, 0, malformedId);
  }
});

test('Justice Slalom UOOU and UOCR digest expressions use imported SHA-256', () => {
  const source = readFileSync(new URL('../scripts/validate-justice-slalom.mjs', import.meta.url), 'utf8');
  const bytes = Buffer.from('%PDF-1.7 synthetic regression fixture');
  const expected = createHash('sha256').update(bytes).digest('hex');
  for (const [digestName, bytesName] of [['uoouDigest', 'uoouBytes'], ['uocrDigest', 'uocrBytes']]) {
    const assignment = source.split('\n').find(line => line.startsWith('const ' + digestName + ' = '));
    assert.ok(assignment, digestName + ' assignment must exist');
    const actual = runInNewContext(assignment + '\n' + digestName + ';', { [bytesName]: bytes, createHash });
    assert.equal(actual, expected, digestName + ' must hash the public PDF bytes');
  }
});
