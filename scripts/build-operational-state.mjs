import { mkdir, readFile, writeFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const documents = await readJson('project-memory/documents-2026.json');
const deadlines = await readJson('project-memory/deadlines.json');
const operations = await readJson('project-memory/operations-ledger.json');

if (!Array.isArray(documents.documents)) throw new Error('Chybí dokumenty pro provozní stav.');
if (!Array.isArray(deadlines.deadlines)) throw new Error('Chybí kanonický registr lhůt.');

const allowed = new Set(operations.classification.allowed_values || []);
const outgoingTypes = new Set(['user_submission', 'user_filing', 'alliance_submission', 'our_submission']);

function classify(item) {
  if (item.submission_side && allowed.has(item.submission_side)) return { value: item.submission_side, basis: 'explicit' };
  if (item.document_type === 'state_record') return { value: 'incoming_from_state_or_public_institution', basis: 'state_record' };
  if (outgoingTypes.has(item.document_type)) return { value: 'outgoing_from_user_or_alliance', basis: 'document_type' };
  if (item.document_type === 'court_record') return { value: 'court_record', basis: 'document_type' };
  return { value: 'unclassified', basis: 'human_review_required' };
}

const classified = documents.documents.map(item => ({ id: item.id, ...classify(item) }));
const count = value => classified.filter(item => item.value === value).length;
const deadlineStates = Object.fromEntries((operations.deadlines.states || []).map(state => [state, 0]));
for (const deadline of deadlines.deadlines) {
  const state = deadline.status || 'human_review_required';
  deadlineStates[state] = (deadlineStates[state] || 0) + 1;
}

const state = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  timezone: operations.clock.canonical_timezone,
  counters: {
    state_and_public_institutions: count('incoming_from_state_or_public_institution'),
    our_submissions: count('outgoing_from_user_or_alliance'),
    unclassified: count('unclassified'),
    total_documents: classified.length
  },
  classification_quality: {
    explicit: classified.filter(item => item.basis === 'explicit').length,
    safely_derived: classified.filter(item => ['state_record', 'document_type'].includes(item.basis)).length,
    human_review_required: classified.filter(item => item.basis === 'human_review_required').length,
    rule: 'Nezařazené položky se nikdy nepřičítají k našim ani státním podáním bez doložené klasifikace.'
  },
  deadlines: {
    total: deadlines.deadlines.length,
    states: deadlineStates,
    source: 'project-memory/deadlines.json',
    provenance_required: operations.deadlines.required_provenance === true
  }
};

await mkdir('web/data', { recursive: true });
await writeFile('web/data/operations-state.json', `${JSON.stringify(state, null, 2)}\n`, 'utf8');
console.log(`Provozní stav: stát/veřejné instituce ${state.counters.state_and_public_institutions}, naše podání ${state.counters.our_submissions}, k lidské klasifikaci ${state.counters.unclassified}, lhůty ${state.deadlines.total}.`);
