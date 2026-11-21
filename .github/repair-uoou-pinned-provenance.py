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
    text = replace_once(
        text,
        "import {\n  evaluateJusticeSlalomPdfProvenance,\n} from '../scripts/justice-slalom-pdf-provenance.mjs';",
        "import {\n  evaluateJusticeSlalomPdfProvenance,\n  evaluatePinnedJusticeSlalomOriginal,\n} from '../scripts/justice-slalom-pdf-provenance.mjs';",
        "provenance test import",
    )
    test_name = "pinned uploaded original accepts an authenticated hardened derivative"
    if test_name in text:
        raise SystemExit("pinned-original regression already exists")
    text = text.rstrip() + """


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
"""
    path.write_text(text, "utf-8")


def implement() -> None:
    module_path = Path("scripts/justice-slalom-pdf-provenance.mjs")
    module = module_path.read_text("utf-8")
    export_name = "export const evaluatePinnedJusticeSlalomOriginal"
    if export_name in module:
        raise SystemExit("pinned-original evaluator already exists")
    module = module.rstrip() + """


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
"""
    module_path.write_text(module, "utf-8")

    validator_path = Path("scripts/validate-justice-slalom.mjs")
    validator = validator_path.read_text("utf-8")
    validator = replace_once(
        validator,
        "import { evaluateJusticeSlalomPdfProvenance } from './justice-slalom-pdf-provenance.mjs';",
        "import {\n  evaluateJusticeSlalomPdfProvenance,\n  evaluatePinnedJusticeSlalomOriginal,\n} from './justice-slalom-pdf-provenance.mjs';",
        "validator provenance import",
    )
    old_block = """const uoouOriginal = items.find(item => item.id === 'doc-cz-dd-2026-10-02-uoou-stiznost-necinnost');
if (!uoouOriginal || uoouOriginal.justice_slalom.source_kind !== 'original_pdf_uploaded_by_user' || uoouOriginal.justice_slalom.source_sha256 !== '37791bd52b5237313dc7bc58a9fc2515689f3038cf3f42ef368836012e59da74' || uoouOriginal.public.sha256 !== uoouOriginal.justice_slalom.source_sha256) fail('ÚOOÚ 2. 10. 2026 nemá byte-identický originál a korektní provenienci');
if (!published.rows.some(row => row.document_id === uoouOriginal.id && row.date === '2026-10-02' && row.recipient_id === 'CZ-UOOU' && row.pdf_kind === 'original')) fail('ÚOOÚ 2. 10. 2026 chybí v Justičním slalomu jako původní PDF');"""
    new_block = """const uoouOriginal = items.find(item => item.id === 'doc-cz-dd-2026-10-02-uoou-stiznost-necinnost');
if (!uoouOriginal) fail('ÚOOÚ 2. 10. 2026 chybí v kanonickém registru');
const uoouExpectedSourceSha = '37791bd52b5237313dc7bc58a9fc2515689f3038cf3f42ef368836012e59da74';
const uoouBytes = await readFile(`web/${uoouOriginal.public.pdf}`).catch(() => fail('ÚOOÚ 2. 10. 2026 nemá dostupné veřejné PDF'));
const uoouDigest = sha(uoouBytes);
const uoouEvaluation = evaluatePinnedJusticeSlalomOriginal({
  doc: uoouOriginal,
  digest: uoouDigest,
  expectedSourceSha: uoouExpectedSourceSha,
  hardeningById,
  hardeningReportOk,
});
if (!uoouEvaluation.provenanceOk) fail('ÚOOÚ 2. 10. 2026 nemá korektně svázaný originál nebo ověřenou veřejnou derivaci');
if (!published.rows.some(row => row.document_id === uoouOriginal.id && row.date === '2026-10-02' && row.recipient_id === 'CZ-UOOU' && row.pdf_kind === uoouEvaluation.effectiveKind)) fail('ÚOOÚ 2. 10. 2026 chybí v Justičním slalomu se správným označením PDF');"""
    validator = replace_once(
        validator,
        old_block,
        new_block,
        "UOOU pinned provenance block",
    )
    validator_path.write_text(validator, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "implementation"}:
        raise SystemExit("usage: repair-uoou-pinned-provenance.py tests|implementation")
    if sys.argv[1] == "tests":
        add_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
