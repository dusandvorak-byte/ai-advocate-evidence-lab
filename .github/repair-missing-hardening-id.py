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
    name = "hardening evidence row without an ID field fails closed"
    if name in text:
        raise SystemExit("missing-ID regression already exists")
    text = text.rstrip() + """


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
"""
    path.write_text(text, "utf-8")


def implement() -> None:
    path = Path("scripts/justice-slalom-pdf-provenance.mjs")
    text = path.read_text("utf-8")
    old = """  const rowShapesValid = rows !== null && rows.every(row => Boolean(
    row
    && typeof row === 'object'
    && (row.id == null || (typeof row.id === 'string' && row.id.length > 0))
  ));"""
    new = """  const rowShapesValid = rows !== null && rows.every(row => Boolean(
    row
    && typeof row === 'object'
    && Object.prototype.hasOwnProperty.call(row, 'id')
    && (row.id === null || (typeof row.id === 'string' && row.id.length > 0))
  ));"""
    text = replace_once(text, old, new, "row shape validation")
    path.write_text(text, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"test", "implementation"}:
        raise SystemExit("usage: repair-missing-hardening-id.py test|implementation")
    if sys.argv[1] == "test":
        add_test()
    else:
        implement()


if __name__ == "__main__":
    main()
