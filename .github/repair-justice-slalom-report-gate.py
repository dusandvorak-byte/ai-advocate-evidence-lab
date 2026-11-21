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
    marker = "test('report-level hard failure blocks hardened derivative'"
    if marker in text:
        raise SystemExit("report-gate regression already exists")
    text = text.replace(
        "    hardeningById:",
        "    hardeningReportOk: true,\n    hardeningById:",
    )
    test = r'''

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
'''
    path.write_text(text.rstrip() + test.rstrip() + "\n", "utf-8")


def implement() -> None:
    helper_path = Path("scripts/justice-slalom-pdf-provenance.mjs")
    helper = helper_path.read_text("utf-8")
    helper = replace_once(
        helper,
        "export const policyHardenedCopyOk = ({ doc, digest, expectedInputSha, hardeningById }) => {\n",
        "export const policyHardenedCopyOk = ({ doc, digest, expectedInputSha, hardeningById, hardeningReportOk }) => {\n",
        "policy helper signature",
    )
    helper = replace_once(
        helper,
        "    hardenedRegistryStatus(doc)\n    && validSha256(digest)\n",
        "    hardeningReportOk === true\n    && hardenedRegistryStatus(doc)\n    && validSha256(digest)\n",
        "report-level policy gate",
    )
    helper = replace_once(
        helper,
        "  hardeningById,\n  requiredInputSha,\n}) => {\n",
        "  hardeningById,\n  hardeningReportOk,\n  requiredInputSha,\n}) => {\n",
        "evaluator report parameter",
    )
    helper = replace_once(
        helper,
        "    expectedInputSha,\n    hardeningById,\n  });\n",
        "    expectedInputSha,\n    hardeningById,\n    hardeningReportOk,\n  });\n",
        "pass report state to helper",
    )
    helper_path.write_text(helper, "utf-8")

    build_path = Path("scripts/build-justice-slalom.mjs")
    build = build_path.read_text("utf-8")
    build = replace_once(
        build,
        "const hardeningById = new Map((privacyHardening.documents || []).map(item => [item.id, item]));\nconst names = new Map(institutions.map(item => [item.id, item.name]));\n",
        "const hardeningById = new Map((privacyHardening.documents || []).map(item => [item.id, item]));\nconst hardeningReportOk = privacyHardening.hard_failure_count === 0\n  && Array.isArray(privacyHardening.hard_failures)\n  && privacyHardening.hard_failures.length === 0;\nif (!hardeningReportOk) throw new Error('JUSTICE-SLALOM: privacy hardening report contains failures');\nconst names = new Map(institutions.map(item => [item.id, item.name]));\n",
        "build report gate",
    )
    build = replace_once(
        build,
        "  } = evaluateJusticeSlalomPdfProvenance({ doc, digest, hardeningById });\n",
        "  } = evaluateJusticeSlalomPdfProvenance({ doc, digest, hardeningById, hardeningReportOk });\n",
        "build evaluator report state",
    )
    build_path.write_text(build, "utf-8")

    validator_path = Path("scripts/validate-justice-slalom.mjs")
    validator = validator_path.read_text("utf-8")
    validator = replace_once(
        validator,
        "const hardeningById = new Map((privacyHardening.documents || []).map(item => [item.id, item]));\nconst published = JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));\n",
        "const hardeningById = new Map((privacyHardening.documents || []).map(item => [item.id, item]));\nconst hardeningReportOk = privacyHardening.hard_failure_count === 0\n  && Array.isArray(privacyHardening.hard_failures)\n  && privacyHardening.hard_failures.length === 0;\nif (!hardeningReportOk) fail('privacy hardening report obsahuje chyby');\nconst published = JSON.parse(await readFile('web/data/justice-slalom.json','utf8'));\n",
        "validator report gate",
    )
    validator = replace_once(
        validator,
        "      hardeningById,\n      requiredInputSha: upload.public_sha256,\n",
        "      hardeningById,\n      hardeningReportOk,\n      requiredInputSha: upload.public_sha256,\n",
        "upload evaluator report state",
    )
    validator = replace_once(
        validator,
        "    hardeningById,\n  });\n",
        "    hardeningById,\n    hardeningReportOk,\n  });\n",
        "item evaluator report state",
    )
    validator_path.write_text(validator, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "implementation"}:
        raise SystemExit("usage: repair-justice-slalom-report-gate.py tests|implementation")
    if sys.argv[1] == "tests":
        add_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
