import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
  evaluateJusticeSlalomPdfProvenance,
  evaluatePinnedJusticeSlalomOriginal,
  policyHardenedCopyOk,
  approvedOct6PublicLabelsMatch,
  publicPdfIsDerivative,
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

test('Oct 6-8 five-file privacy derivation preserves original SHA and fails closed on tampering', () => {
  const specs = [
    ['doc-cz-dd-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni','c831604cc60860d0dee289ea4a39bb61aa5a006f720ad975bcf1ef590fb9c0a7','2d96160c68d5cc8a7f696627d8e3599f604edf25f5ca4a31227375e963d1c1fa',true],
    ['doc-cz-ekk-dd-2026-10-08-kpr-nsz-msp-pp-mv-ospro-dukazni-doplneni','9490a2cde83d76ec9b9fcf838df622e706725de651ed3b807a46e0f3b57fcda3','1d214d32da58ef5ce6ec94eea3df57670c5da9e9e2ecc3e3ba451e71e30c4ed6',true],
    ['doc-eu-omb-2026-10-07-202602199-registration','8da9712f3ea540ce2b5f6364175b06eb9e95dfa826506f7be758d998ab9fcdc2','21a1347b0ac3db0404940a07fd76bf1aff978e1648fd9c686ca3f4f868616564',false],
    ['doc-cz-ms-pha-2026-10-06-15-ad-14-2026-13','25ecfff3def2fe8b328cc90bf970801b2778038befb9e0330e6abeb968c1a2c8','55e7082daad163019ced6ab12d5299e94b82a4b2e4db06185c387e7956454e9e',false],
    ['doc-cz-ms-pha-2026-10-07-15-ad-14-2026-17','72c6162e095559546988d4f8b0e2423a486d6213c4881fb2b240b44fd5275383','1bbcb1794a19d9f8b9a2502a5498142e7f7e0689579e1feb81e3a96d30a0c646',false],
  ];
  for(const [id,sourceSha,outputSha,isSlalom] of specs) {
    const doc = { ...makeDoc({
      publicSha:outputSha,sourceSha,
      sourceKind:isSlalom?'original_pdf_uploaded_by_user':'none',
      verificationStatus:'source_pdf_received_binary_original; publication_policy_hardened',
    }), id };
    const goodRow={ ...hardenedRow({inputSha:sourceSha,outputSha}),id };
    const verified={
      doc,digest:outputSha,expectedInputSha:sourceSha,
      hardeningReportOk:true,hardeningById:new Map([[id,goodRow]]),
    };
    assert.equal(policyHardenedCopyOk(verified),true,id);
    assert.equal(policyHardenedCopyOk({...verified,hardeningReportOk:false}),false,id+' requires authenticated report');
    for(const changedRow of [
      {...goodRow,input_sha256:'f'.repeat(64)},
      {...goodRow,output_sha256:'f'.repeat(64)},
      {...goodRow,public_path:'documents/other.pdf'},
      {...goodRow,known_private_identifier_hits_after:['synthetic-hit']},
      {...goodRow,decoded_private_identifier_hits_after:['synthetic-hit']},
    ]) assert.equal(policyHardenedCopyOk({
      ...verified,hardeningById:new Map([[id,changedRow]]),
    }),false,id+' must reject altered provenance/privacy');
    if(isSlalom){
      const p=evaluatePinnedJusticeSlalomOriginal({
        doc,digest:outputSha,expectedSourceSha:sourceSha,
        hardeningReportOk:true,hardeningById:new Map([[id,goodRow]]),
      });
      assert.equal(p.provenanceOk,true,id);
      assert.equal(p.effectiveKind,'redacted_public_copy',id);
    }
  }
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

// Oct 6 documented originals (ČNB, MS Praha, EU Ombudsman) must remain
// source-pinned while their public redacted derivatives are independently bound.
test('Oct 6 redacted public copies require authenticated exact-source evidence', () => {
  const uploaded = [
    ['doc-cz-ekk-2026-10-06-cnb-rb-aml-podnet', 'a5e5890356ca4f7d520bdda7cbdbff1ffee92f9da9fffa37c9556f991e8252d4'],
    ['doc-cz-dd-2026-10-06-ms-praha-18a17-18a23-dukazni-doplneni', '6fac4edb59d7e5f67519ec853d810f9fc4a41e5946698ba54b1e7777d173082e'],
    ['doc-cz-citc-2026-10-06-eu-ombudsman-euda-form-59936', '34254d11c01f91e8a12cb99800e8d16ca9ec715a6703d765401ddcd79595e434'],
  ];
  for (const [id, sourceSha] of uploaded) {
    const doc = {
      ...makeDoc({
        sourceKind: id.includes('ombudsman') ? 'none' : 'original_pdf_uploaded_by_user',
        publicSha: HARDENED_SHA, sourceSha,
        verificationStatus: 'published; publication_policy_hardened',
      }),
      id,
    };
    const row = { ...hardenedRow({ inputSha: sourceSha }), id };
    const report = {
      hard_failure_count: 0, hard_failures: [],
      authenticated_private_policy_identity: POLICY_IDENTITY,
      documents: [row],
    };
    const options = { expectedAuthenticatedPolicyIdentity: POLICY_IDENTITY };
    const valid = indexJusticeSlalomHardeningEvidence(report, options);
    assert.equal(valid.hardeningReportOk, true, id);
    assert.equal(policyHardenedCopyOk({
      doc, digest: HARDENED_SHA, expectedInputSha: sourceSha, ...valid,
    }), true, id);
    for (const identity of [undefined, null, '', 'b'.repeat(64)]) {
      const bad = indexJusticeSlalomHardeningEvidence({
        ...report, authenticated_private_policy_identity: identity,
      }, options);
      assert.equal(bad.hardeningReportOk, false, id + ': unauthenticated privacy report');
      assert.equal(policyHardenedCopyOk({
        doc, digest: HARDENED_SHA, expectedInputSha: sourceSha, ...bad,
      }), false, id + ': unauthenticated copy must fail');
    }
    for (const damagedRow of [
      { ...row, input_sha256: 'f'.repeat(64) },
      { ...row, output_sha256: 'f'.repeat(64) },
      { ...row, known_private_identifier_hits_after: ['synthetic-privacy-hit'] },
      { ...row, decoded_private_identifier_hits_after: ['synthetic-privacy-hit'] },
      { ...row, public_path: 'documents/wrong-file.pdf' },
    ]) {
      assert.equal(policyHardenedCopyOk({
        doc, digest: HARDENED_SHA, expectedInputSha: sourceSha,
        ...indexJusticeSlalomHardeningEvidence({
          ...report, documents: [damagedRow],
        }, options),
      }), false, id + ': tampered report evidence must fail');
    }
    if(!id.includes('ombudsman')) {
      const proof = evaluatePinnedJusticeSlalomOriginal({
        doc, digest: HARDENED_SHA, expectedSourceSha: sourceSha, ...valid,
      });
      assert.equal(proof.provenanceOk, true, id);
      assert.equal(proof.effectiveKind, 'redacted_public_copy', id);
    }
  }
});

test('Oct 6 exact publication labels reject paraphrases, negations and source/public confusion', () => {
  const approvedCs = 'Originál je zachován; veřejný soubor je redigovaná kopie.';
  const approvedEn = 'The uploaded original is archived; the public PDF is a privacy-redacted derivative.';
  const testLabels = (actualCs,actualEn) => approvedOct6PublicLabelsMatch({
    actualCs, actualEn, approvedCs, approvedEn,
  });
  assert.equal(testLabels(approvedCs, approvedEn), true);
  for(const falseCs of [
    'Veřejné PDF je byte-identický originál, nikoli redigovaná kopie.',
    'Veřejný soubor je původní originál; redigovaná kopie neexistuje.',
    'Originál je zachován; veřejný soubor není redigovaná kopie.',
    'Public PDF is an original; redigovaná kopie.',
    approvedCs + ' Kopie je ve skutečnosti originál.',
  ]) assert.equal(testLabels(falseCs, approvedEn), false, falseCs);
  for(const falseEn of [
    'The public PDF is the original, not a redacted copy.',
    'The public PDF is a byte-identical original, not a privacy-redacted derivative.',
    'The public PDF is not a privacy-redacted derivative.',
    approvedEn + ' The public PDF is the original.',
  ]) assert.equal(testLabels(approvedCs, falseEn), false, falseEn);
  assert.equal(testLabels(undefined, approvedEn), false);
  assert.equal(testLabels(approvedCs, null), false);
});

test('public evidence-page link labels honor hardened provenance over unchanged PDF filename', () => {
  const sourceSha = 'a'.repeat(64);
  const publicSha = 'b'.repeat(64);
  const filepath = 'documents/justice-slalom/2026-10/097-podani-2026-10-06-cnb-raiffeisenbank.pdf';
  assert.equal(publicPdfIsDerivative({
    public: { pdf: filepath, sha256: publicSha, source_original_sha256: sourceSha,
      verification_status: 'source_pdf_received_binary_original; publication_policy_hardened' },
  }), true, 'hardened copy must not be labeled as an original');
  assert.equal(publicPdfIsDerivative({
    public: { pdf: filepath, sha256: publicSha, source_original_sha256: sourceSha,
      verification_status: 'source_pdf_received_binary_original' },
  }), true, 'different original/public SHA alone requires public-copy label');
  assert.equal(publicPdfIsDerivative({
    public: { pdf: filepath, sha256: sourceSha, source_original_sha256: sourceSha,
      verification_status: 'source_pdf_received_binary_original' },
  }), false, 'unchanged original remains labeled as original');
  assert.equal(publicPdfIsDerivative({
    public: { pdf: filepath, sha256: sourceSha, source_original_sha256: sourceSha,
      verification_status: 'publication_policy_hardened' },
  }), true, 'explicit hardened status must always classify as a public copy');
  assert.equal(publicPdfIsDerivative({
    public: { pdf: null, sha256: publicSha, source_original_sha256: sourceSha,
      verification_status: 'publication_policy_hardened' },
  }), false, 'no published PDF is not a public copy link');
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


import { publicShaPins, assertPinnedPublicSha } from '../scripts/godot-public-sha-pins.mjs';
import { historicalOriginals, verifyHistoricPdfIdentity } from '../scripts/interpelace-380-integrity.mjs';

test('P1 #286 rejects joint tampering of public bytes, registry and report against independent pins', () => {
  assert.equal(Object.keys(publicShaPins).length, 5);
  for (const [id, publicSha] of Object.entries(publicShaPins)) {
    assert.equal(assertPinnedPublicSha({
      id, digest: publicSha, registrySha: publicSha, reportSha: publicSha,
    }), true);
    const forged = 'f'.repeat(64) === publicSha ? 'e'.repeat(64) : 'f'.repeat(64);
    assert.throws(() => assertPinnedPublicSha({
      id, digest: forged, registrySha: forged, reportSha: forged,
    }), /Unrecognized public copy/, id + ': colluding file+registry+report');
    assert.throws(() => assertPinnedPublicSha({
      id, digest: publicSha, registrySha: publicSha, reportSha: forged,
    }), /Unrecognized public copy/);
    assert.throws(() => assertPinnedPublicSha({
      id, digest: publicSha, registrySha: forged, reportSha: publicSha,
    }), /Unrecognized public copy/);
  }
  assert.throws(() => assertPinnedPublicSha({
    id: 'doc-fake-new-pdf', digest: 'f'.repeat(64),
    registrySha: 'f'.repeat(64), reportSha: 'f'.repeat(64),
  }), /Unrecognized public copy/);
  const validator = readFileSync(new URL('../scripts/validate-godot-filings-2026-10-08.mjs', import.meta.url), 'utf8');
  assert.match(validator, /assertPinnedPublicSha\(\{id,digest,registrySha:published\.public\?\.sha256,reportSha:row\?\.output_sha256\}\)/);
});

test('interpelace 380 retains independent original and hardened public identities', () => {
  assert.equal(historicalOriginals.length, 2);
  assert.notEqual(historicalOriginals[0].originalSha, historicalOriginals[0].publicSha);
  assert.equal(historicalOriginals[1].originalSha, historicalOriginals[1].publicSha);
  const source = Buffer.from('%PDF-1.4\nsource original\n%%EOF\n');
  const derivative = Buffer.from('%PDF-1.4\nprivacy hardened copy\n%%EOF\n');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const spec = {
    path: 'test.pdf', originalSize: source.length, originalSha: sha(source),
    publicSize: derivative.length, publicSha: sha(derivative), pages: 2,
  };
  assert.equal(verifyHistoricPdfIdentity(spec, source, derivative).alteredPublicCopy, true);
  assert.throws(() => verifyHistoricPdfIdentity(spec, derivative, derivative),
    /Archived original identity mismatch/);
  assert.throws(() => verifyHistoricPdfIdentity(spec, source, source),
    /Pinned public PDF identity mismatch/);
  assert.throws(() => verifyHistoricPdfIdentity(spec, source, Buffer.concat([derivative, Buffer.from('tamper')])),
    /Pinned public PDF identity mismatch/);
  assert.throws(() => verifyHistoricPdfIdentity(spec, source, Buffer.from('fake')),
    /Pinned public PDF identity mismatch/);
});


import { validatePublicationBatch } from '../scripts/validate-publication-batch.mjs';

test('candidate standalone manifest rejects absent human approval, SHA drift and duplicate paths', () => {
  const item = () => ({
    document_id: 'doc-example-2026-11-23',
    issuer: 'state', case_ids: ['case-demo'],
    source_original_sha256: 'a'.repeat(64), public_sha256: 'b'.repeat(64),
    public_path: 'documents/demo/test.pdf',
    privacy_review: {
      decision: 'approved_for_publication', reviewed_public_sha256: 'b'.repeat(64), reviewer: 'example', receipt: 'demo-receipt',
    },
    approval: {
      authorized_public_sha256: 'b'.repeat(64), authorized_by: 'du-demo', receipt: 'approval-demo',
    },
  });
  const wrap = items => ({ schema_version: '1', batch_id: 'demo-release', items });
  assert.equal(validatePublicationBatch(wrap([item()])).count, 1);
  for (const damage of [
    x => { x.approval.authorized_public_sha256 = 'f'.repeat(64); },
    x => { x.privacy_review.decision = 'unreviewed'; },
    x => { x.privacy_review.reviewed_public_sha256 = 'f'.repeat(64); },
    x => { x.privacy_review.receipt = ''; },
    x => { x.approval.receipt = ''; },
    x => { x.public_path = 'documents/../secret.pdf'; },
    x => { x.public_path = 'documents//test.pdf'; },
    x => { x.document_id = 'bad'; },
    x => { x.public_sha256 = 'wrong'; },
    x => { x.issuer = 'unknown'; },
    x => { x.document_id = ['doc-example-2026-11-23']; },
    x => { x.document_id = { toString: () => 'doc-example-2026-11-23' }; },
    x => { x.public_path = ['documents/demo/test.pdf']; },
    x => { x.source_original_sha256 = ['a'.repeat(64)]; },
    x => { x.public_sha256 = ['b'.repeat(64)]; },
    x => { x.privacy_review.reviewer = ['example']; },
    x => { x.privacy_review.receipt = ['demo-receipt']; },
    x => { x.approval.authorized_by = ['du-demo']; },
    x => { x.approval.receipt = ['approval-demo']; },

  ]) {
    const x = item();
    damage(x);
    assert.throws(() => validatePublicationBatch(wrap([x])), /PUBLICATION_MANIFEST_INVALID/);
  }
  assert.throws(() => validatePublicationBatch(wrap([item(), item()])), /document identity/);
  const a = item(); const b = item();
  a.document_id = ['doc-example-2026-11-23'];
  b.document_id = ['doc-example-2026-11-23'];
  b.public_path = 'documents/demo/other.pdf';
  assert.throws(() => validatePublicationBatch(wrap([a, b])), /document identity/);
  assert.throws(() => validatePublicationBatch({ ...wrap([item()]), batch_id: ['demo-release'] }), /schema\/batch/);

  const second = item();
  second.document_id = 'doc-example-2026-11-24';
  assert.throws(() => validatePublicationBatch(wrap([item(), second])), /public path/);
  assert.throws(() => validatePublicationBatch({
    ...wrap([item()]), release_mode: 'publish',
  }), /unknown release_mode/);
});
