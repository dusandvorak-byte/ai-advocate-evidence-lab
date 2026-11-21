#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"unexpected {label} count: {count}")
    return text.replace(old, new)


def add_tests() -> None:
    path = Path("test/justice-slalom-pdf-provenance.test.mjs")
    text = path.read_text("utf-8")
    marker = "test('missing input SHA cannot authorize hardening'"
    if marker in text:
        raise SystemExit("review regression tests already exist")
    tests = r'''

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
    hardeningById: new Map([['doc-test', row]]),
    requiredInputSha: inventorySha,
  });
  const wrongInventory = evaluateJusticeSlalomPdfProvenance({
    doc,
    digest: HARDENED_SHA,
    hardeningById: new Map([['doc-test', row]]),
    requiredInputSha: '5'.repeat(64),
  });

  assert.equal(inventoryBound.provenanceOk, true);
  assert.equal(inventoryBound.policyHardened, true);
  assert.equal(wrongInventory.provenanceOk, false);
  assert.equal(wrongInventory.policyHardened, false);
});
'''
    path.write_text(text.rstrip() + tests + "\n", "utf-8")


def implement() -> None:
    helper_path = Path("scripts/justice-slalom-pdf-provenance.mjs")
    helper = helper_path.read_text("utf-8")
    helper = replace_once(
        helper,
        "const redactedOriginalKind = 'redacted_original_from_user_binary';\n",
        "const redactedOriginalKind = 'redacted_original_from_user_binary';\nconst SHA256_RE = /^[0-9a-f]{64}$/i;\nconst validSha256 = value => typeof value === 'string' && SHA256_RE.test(value);\n",
        "SHA validator insertion",
    )
    old_policy = '''export const policyHardenedCopyOk = ({ doc, digest, expectedInputSha, hardeningById }) => {
  const row = hardeningById.get(doc.id);
  return Boolean(
    hardenedRegistryStatus(doc)
    && row
    && row.changed
    && row.public_path === doc.public?.pdf
    && row.input_sha256 === expectedInputSha
    && row.output_sha256 === digest
    && Array.isArray(row.known_private_identifier_hits_after)
    && row.known_private_identifier_hits_after.length === 0
    && Array.isArray(row.decoded_private_identifier_hits_after)
    && row.decoded_private_identifier_hits_after.length === 0
  );
};
'''
    new_policy = '''export const policyHardenedCopyOk = ({ doc, digest, expectedInputSha, hardeningById }) => {
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
'''
    helper = replace_once(helper, old_policy, new_policy, "strict hardening evidence")
    old_eval = '''export const evaluateJusticeSlalomPdfProvenance = ({ doc, digest, hardeningById }) => {
  const meta = doc.justice_slalom || {};
  const declaredKind = declaredJusticeSlalomPdfKind(doc);
  const expectedInputSha = declaredKind === 'original'
    ? meta.source_sha256
    : meta.public_sha256;
  const policyHardened = policyHardenedCopyOk({
    doc,
    digest,
    expectedInputSha,
    hardeningById,
  });
  const copyManifest = copyManifestFor(doc);
  const provenanceOk = declaredKind === 'original'
    ? digest === meta.source_sha256 || policyHardened
    : Boolean(copyManifest) && (digest === meta.public_sha256 || policyHardened);
  const effectiveKind = policyHardened && declaredKind === 'original'
    ? 'redacted_public_copy'
    : declaredKind;
'''
    new_eval = '''export const evaluateJusticeSlalomPdfProvenance = ({
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
'''
    helper = replace_once(helper, old_eval, new_eval, "required input SHA evaluation")
    helper_path.write_text(helper, "utf-8")

    validator_path = Path("scripts/validate-justice-slalom.mjs")
    validator = validator_path.read_text("utf-8")
    old_call = '''    const evaluation = evaluateJusticeSlalomPdfProvenance({
      doc: item,
      digest: item.public.sha256,
      hardeningById,
    });
'''
    new_call = '''    const evaluation = evaluateJusticeSlalomPdfProvenance({
      doc: item,
      digest: item.public.sha256,
      hardeningById,
      requiredInputSha: upload.public_sha256,
    });
'''
    validator = replace_once(validator, old_call, new_call, "upload inventory SHA binding")
    validator_path.write_text(validator, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "implementation"}:
        raise SystemExit("usage: repair-justice-slalom-review-findings.py tests|implementation")
    if sys.argv[1] == "tests":
        add_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
