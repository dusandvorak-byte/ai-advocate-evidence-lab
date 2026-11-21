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
    name = "malformed concrete hardening evidence IDs fail closed"
    if name in text:
        raise SystemExit("malformed-ID regression already exists")
    text = text.rstrip() + """


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
"""
    path.write_text(text, "utf-8")


def implement() -> None:
    path = Path("scripts/justice-slalom-pdf-provenance.mjs")
    text = path.read_text("utf-8")
    old_constants = """const SHA256_RE = /^[0-9a-f]{64}$/i;
const validSha256 = value => typeof value === 'string' && SHA256_RE.test(value);"""
    new_constants = """const SHA256_RE = /^[0-9a-f]{64}$/i;
const DOCUMENT_ID_RE = /^doc-[a-z0-9-]+$/;
const validSha256 = value => typeof value === 'string' && SHA256_RE.test(value);"""
    text = replace_once(text, old_constants, new_constants, "document ID regex")
    old_shape = """    && Object.prototype.hasOwnProperty.call(row, 'id')
    && (row.id === null || (typeof row.id === 'string' && row.id.length > 0))"""
    new_shape = """    && Object.prototype.hasOwnProperty.call(row, 'id')
    && (row.id === null || (typeof row.id === 'string' && DOCUMENT_ID_RE.test(row.id)))"""
    text = replace_once(text, old_shape, new_shape, "row ID validation")
    path.write_text(text, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"test", "implementation"}:
        raise SystemExit("usage: repair-malformed-hardening-id.py test|implementation")
    if sys.argv[1] == "test":
        add_test()
    else:
        implement()


if __name__ == "__main__":
    main()
