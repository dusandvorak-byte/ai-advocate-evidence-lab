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
        "import {\n  evaluateJusticeSlalomPdfProvenance,\n  evaluatePinnedJusticeSlalomOriginal,\n} from '../scripts/justice-slalom-pdf-provenance.mjs';",
        "import {\n  evaluateJusticeSlalomPdfProvenance,\n  evaluatePinnedJusticeSlalomOriginal,\n  indexJusticeSlalomHardeningEvidence,\n} from '../scripts/justice-slalom-pdf-provenance.mjs';",
        "test import",
    )
    test_name = "duplicate hardening evidence IDs fail closed"
    if test_name in text:
        raise SystemExit("duplicate-ID regression already exists")
    text = text.rstrip() + """


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
"""
    path.write_text(text, "utf-8")


def implement() -> None:
    module_path = Path("scripts/justice-slalom-pdf-provenance.mjs")
    module = module_path.read_text("utf-8")
    anchor = "const validSha256 = value => typeof value === 'string' && SHA256_RE.test(value);\n"
    helper = """

export const indexJusticeSlalomHardeningEvidence = report => {
  const rows = Array.isArray(report?.documents) ? report.documents : null;
  const ids = rows?.map(row => row?.id) || [];
  const idsValid = rows !== null
    && ids.every(id => typeof id === 'string' && id.length > 0);
  const idsUnique = idsValid && new Set(ids).size === ids.length;
  const reportClean = report?.hard_failure_count === 0
    && Array.isArray(report?.hard_failures)
    && report.hard_failures.length === 0;
  const hardeningReportOk = Boolean(reportClean && idsUnique);

  return {
    hardeningReportOk,
    hardeningById: hardeningReportOk
      ? new Map(rows.map(row => [row.id, row]))
      : new Map(),
  };
};
"""
    if "export const indexJusticeSlalomHardeningEvidence" in module:
        raise SystemExit("hardening evidence indexer already exists")
    module = replace_once(module, anchor, anchor + helper, "module helper anchor")
    module_path.write_text(module, "utf-8")

    for path_name, error_message in (
        ("scripts/build-justice-slalom.mjs", "JUSTICE-SLALOM: privacy hardening report contains failures or ambiguous document IDs"),
        ("scripts/validate-justice-slalom.mjs", "privacy hardening report obsahuje chyby nebo duplicitní ID dokumentů"),
    ):
        path = Path(path_name)
        text = path.read_text("utf-8")
        if path_name.endswith("build-justice-slalom.mjs"):
            old_import = "import { evaluateJusticeSlalomPdfProvenance } from './justice-slalom-pdf-provenance.mjs';"
            new_import = "import {\n  evaluateJusticeSlalomPdfProvenance,\n  indexJusticeSlalomHardeningEvidence,\n} from './justice-slalom-pdf-provenance.mjs';"
            old_block = """const privacyHardening = JSON.parse(await readFile('project-memory/privacy-hardening-report.json', 'utf8'));
const hardeningById = new Map((privacyHardening.documents || []).map(item => [item.id, item]));
const hardeningReportOk = privacyHardening.hard_failure_count === 0
  && Array.isArray(privacyHardening.hard_failures)
  && privacyHardening.hard_failures.length === 0;
if (!hardeningReportOk) throw new Error('JUSTICE-SLALOM: privacy hardening report contains failures');"""
            new_block = """const privacyHardening = JSON.parse(await readFile('project-memory/privacy-hardening-report.json', 'utf8'));
const { hardeningById, hardeningReportOk } = indexJusticeSlalomHardeningEvidence(privacyHardening);
if (!hardeningReportOk) throw new Error('JUSTICE-SLALOM: privacy hardening report contains failures or ambiguous document IDs');"""
        else:
            old_import = """import {
  evaluateJusticeSlalomPdfProvenance,
  evaluatePinnedJusticeSlalomOriginal,
} from './justice-slalom-pdf-provenance.mjs';"""
            new_import = """import {
  evaluateJusticeSlalomPdfProvenance,
  evaluatePinnedJusticeSlalomOriginal,
  indexJusticeSlalomHardeningEvidence,
} from './justice-slalom-pdf-provenance.mjs';"""
            old_block = """const privacyHardening = JSON.parse(await readFile('project-memory/privacy-hardening-report.json','utf8'));
const hardeningById = new Map((privacyHardening.documents || []).map(item => [item.id, item]));
const hardeningReportOk = privacyHardening.hard_failure_count === 0
  && Array.isArray(privacyHardening.hard_failures)
  && privacyHardening.hard_failures.length === 0;
if (!hardeningReportOk) fail('privacy hardening report obsahuje chyby');"""
            new_block = """const privacyHardening = JSON.parse(await readFile('project-memory/privacy-hardening-report.json','utf8'));
const { hardeningById, hardeningReportOk } = indexJusticeSlalomHardeningEvidence(privacyHardening);
if (!hardeningReportOk) fail('privacy hardening report obsahuje chyby nebo duplicitní ID dokumentů');"""
        text = replace_once(text, old_import, new_import, f"{path_name} import")
        text = replace_once(text, old_block, new_block, f"{path_name} report block")
        path.write_text(text, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "implementation"}:
        raise SystemExit("usage: repair-duplicate-hardening-evidence.py tests|implementation")
    if sys.argv[1] == "tests":
        add_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
