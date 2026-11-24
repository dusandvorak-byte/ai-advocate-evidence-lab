import test from 'node:test';
import assert from 'node:assert/strict';
import { createReconciliationNormalization, indexByReference } from '../scripts/reconciliation-reference-index.mjs';

const oldNorm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/čj|c\.\s*j\.|sp\.\s*zn\.|spzn/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const oldCompact = value => oldNorm(value).replace(/\s+/g, '');
const { norm, compact } = createReconciliationNormalization();
const examples = [undefined, null, false, 0, 12, '', '  ', 'č. j. AB-1/2026', 'ČJ AB 1/2026', 'sp. zn. AB-1/2026', 'A B 1/2026', 'Příloha č. 2', 'PŘÍLOHA č. 2', '__proto__', 'constructor'];
const documents = Array.from({ length: 160 }, (_, i) => ({ id: i, reference: examples[i % examples.length], issue_date: i % 3 ? '2026-11-04' : undefined, institution_id: i % 2 ? 'a' : 'b' }));
const sources = Array.from({ length: 200 }, (_, i) => ({ path: 'pdf/' + (i % 19) + '.pdf', reference: examples[(i * 7) % examples.length], date: i % 4 ? '2026-11-04' : '2026-11-05', institution_id: i % 3 ? 'a' : undefined }));

test('normalization preserves previous behavior, including missing and Czech values', () => {
  for (const value of [...examples, ...examples]) {
    assert.equal(norm(value), oldNorm(value));
    assert.equal(compact(value), oldCompact(value));
  }
});

test('declared owner lookup preserves date/institution filters and ambiguity', () => {
  const index = indexByReference(documents, compact);
  for (const src of sources) {
    const key = oldCompact(src.reference);
    const predicate = doc => !(src.date && doc.issue_date && src.date !== doc.issue_date) && !(src.institution_id && src.institution_id !== doc.institution_id);
    const previous = key ? documents.filter(doc => oldCompact(doc.reference) === key && predicate(doc)) : [];
    const next = (index.get(compact(src.reference)) || []).filter(predicate);
    assert.deepEqual(next, previous);
  }
});

test('source lookup preserves order, duplicate paths, missing references and ambiguity', () => {
  const index = indexByReference(sources, compact);
  for (const doc of documents) {
    const key = oldCompact(doc.reference);
    const predicate = src => (!src.date || !doc.issue_date || src.date === doc.issue_date) && (!src.institution_id || src.institution_id === doc.institution_id);
    const previous = sources.filter(src => predicate(src) && key && oldCompact(src.reference) && oldCompact(src.reference) === key);
    const next = (index.get(compact(doc.reference)) || []).filter(predicate);
    assert.deepEqual(next, previous);
    assert.deepEqual([...new Map(next.map(src => [src.path, src])).values()], [...new Map(previous.map(src => [src.path, src])).values()]);
  }
});
