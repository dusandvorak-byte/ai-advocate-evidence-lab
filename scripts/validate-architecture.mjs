import { access, readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const exists = path => access(path).then(() => true).catch(() => false);

const architecture = await readJson('project-memory/architecture.json');
const goals = await readJson('project-memory/project-goals.json');
const operations = await readJson('project-memory/operations-ledger.json');
const axioms = await readJson('project-memory/publication-axioms.json');
const knowledge = await readJson('project-memory/knowledge-sources.json');

if (architecture.status !== 'binding') throw new Error('Architektura není závazná.');
if (architecture.single_build_entrypoint !== 'scripts/build-site.mjs') throw new Error('Existuje jiný hlavní build entrypoint.');
if (!architecture.internal_knowledge_is_not_public_by_default) throw new Error('Interní znalost není oddělena od veřejné publikace.');
if (!architecture.publication_requires_successful_validation) throw new Error('Publikace není podmíněna validací.');
if (!goals.status || goals.status !== 'binding' || !Array.isArray(goals.goals) || goals.goals.length < 10) throw new Error('Chybí závazné cíle projektu.');
if (!operations.clock?.no_parallel_clock_registry || !operations.deadlines?.no_parallel_deadline_registry) throw new Error('Čas nebo lhůty mají paralelní registr.');
if (!operations.counters?.state_and_public_institutions?.stored_manual_value_forbidden) throw new Error('Státní počítadlo smí být ruční.');
if (!operations.counters?.our_submissions?.stored_manual_value_forbidden) throw new Error('Naše počítadlo smí být ruční.');
if (axioms.status !== 'binding') throw new Error('Publikační axiomy nejsou závazné.');
if (!knowledge.rules?.automatic_publication_forbidden) throw new Error('Interní zdroje lze automaticky publikovat.');

for (const [name, path] of Object.entries(architecture.canonical_registries)) {
  if (!(await exists(path))) throw new Error(`Chybí kanonický registr ${name}: ${path}`);
  await readJson(path);
}

const requiredGoals = [
  'person_owned_auditable_memory',
  'local_and_external_https_document_ingest',
  'single_clock_deadline_and_inactivity_system',
  'derived_state_public_institution_counter',
  'derived_user_alliance_submission_counter',
  'document_case_institution_person_law_case_law_graph',
  'controlled_publication_and_privacy',
  'truthful_live_verification_before_completion_claim'
];
for (const goal of requiredGoals) if (!goals.goals.includes(goal)) throw new Error(`Ztracený cíl projektu: ${goal}`);

console.log(`Architektura Evidence Lab 2.0 je konzistentní: ${goals.goals.length} závazných cílů, jeden build, jeden časový systém a dvě odvozená počítadla.`);
