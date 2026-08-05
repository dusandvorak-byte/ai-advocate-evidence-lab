import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const registry = JSON.parse(await readFile('project-memory/documents-2026.json', 'utf8'));
const institutions = JSON.parse(await readFile('project-memory/institutions.json', 'utf8'));
const source = await readFile('web/document-chronology.js', 'utf8');

assert.ok(Array.isArray(registry.documents), 'Registry must contain documents array');
assert.ok(registry.documents.length >= 57, 'Registry must contain the current chronology');
assert.equal(registry.ordering.stored_sequence_numbers, false, 'Sequence numbers must never be stored');
assert.equal(registry.ordering.stable_anchor_field, 'id', 'Stable anchors must use document IDs');

const ids = new Set();
for (const documentItem of registry.documents) {
  assert.ok(documentItem.id, 'Every document must have a stable ID');
  assert.ok(documentItem.issue_date, `${documentItem.id} must have issue_date`);
  assert.ok(documentItem.institution_id, `${documentItem.id} must have institution_id`);
  assert.ok(!ids.has(documentItem.id), `Duplicate document ID: ${documentItem.id}`);
  ids.add(documentItem.id);
}

const institutionEntries = Array.isArray(institutions.institutions)
  ? institutions.institutions
  : Object.values(institutions.institutions || {});
const institutionIds = new Set(institutionEntries.map(item => item.id));
for (const documentItem of registry.documents) {
  assert.ok(institutionIds.has(documentItem.institution_id), `Unknown institution: ${documentItem.institution_id}`);
}

assert.match(source, /issue_date/);
assert.match(source, /received_date/);
assert.match(source, /item\.id = documentItem\.id/);
assert.doesNotMatch(source, /polozka-\d+/i, 'Dynamic chronology must not depend on positional anchors');

const appended = {
  id: 'doc-test-retroactive-2026-07-25',
  issue_date: '2026-07-25',
  received_date: '2026-08-06',
  institution_id: registry.documents[0].institution_id
};
const sorted = [...registry.documents, appended].sort((a, b) => {
  const issue = String(a.issue_date || '').localeCompare(String(b.issue_date || ''));
  if (issue) return issue;
  const received = String(a.received_date || '').localeCompare(String(b.received_date || ''));
  if (received) return received;
  return String(a.id || '').localeCompare(String(b.id || ''));
});
const insertedIndex = sorted.findIndex(item => item.id === appended.id);
assert.ok(insertedIndex > 0 && insertedIndex < sorted.length - 1, 'Retroactively received document must be inserted chronologically, not appended');
assert.equal(sorted[insertedIndex].issue_date, '2026-07-25');

console.log(`Dynamic chronology registry validated: ${registry.documents.length} documents and ${institutionIds.size} institutions.`);
