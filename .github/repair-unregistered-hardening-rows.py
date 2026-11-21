#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"unexpected {label} count: {count}")
    return text.replace(old, new)


def add_test() -> None:
    path = Path("test/justice-slalom-pdf-provenance.test.mjs")
    text = path.read_text("utf-8")
    name = "unregistered evidence rows without IDs remain non-authoritative"
    if name in text:
        raise SystemExit("unregistered-row regression already exists")
    text = text.rstrip() + """


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
"""
    path.write_text(text, "utf-8")


def implement() -> None:
    path = Path("scripts/justice-slalom-pdf-provenance.mjs")
    text = path.read_text("utf-8")
    old = """export const indexJusticeSlalomHardeningEvidence = report => {
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
};"""
    new = """export const indexJusticeSlalomHardeningEvidence = report => {
  const rows = Array.isArray(report?.documents) ? report.documents : null;
  const rowShapesValid = rows !== null && rows.every(row => Boolean(
    row
    && typeof row === 'object'
    && (row.id == null || (typeof row.id === 'string' && row.id.length > 0))
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
};"""
    text = replace_once(text, old, new, "evidence indexer")
    path.write_text(text, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"test", "implementation"}:
        raise SystemExit("usage: repair-unregistered-hardening-rows.py test|implementation")
    if sys.argv[1] == "test":
        add_test()
    else:
        implement()


if __name__ == "__main__":
    main()
