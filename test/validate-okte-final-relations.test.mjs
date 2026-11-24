import test from 'node:test';
import assert from 'node:assert/strict';
import { PARENT_ID, validateFinalOkteRelations } from '../scripts/validate-okte-final-relations.mjs';

const make = () => {
  const annexes = Array.from({ length: 10 }, (_, i) => ({
    id: `okte-synthetic-${i + 1}`,
    public: { pdf: `documents/okte-synthetic-${i + 1}.pdf` },
    relations: [{ type: 'priloha_k', target_id: PARENT_ID }],
  }));
  const parent = {
    id: PARENT_ID,
    evidence_note: 'Ten separately registered annex PDFs are available.',
    relations: annexes.map(x => ({ type: 'priloha', target_id: x.id }))
      .concat([{ type: 'souvisi', target_id: 'synthetic-complaint' }]),
  };
  return { annexes, registry: { documents: [parent, ...annexes] } };
};

test('accept 10 forward and 10 reverse annex relations with published paths', () => {
  const { annexes, registry } = make();
  assert.deepEqual(validateFinalOkteRelations(registry, annexes), []);
});

test('reject overwritten parent relations and obsolete note', () => {
  const { annexes, registry } = make();
  registry.documents[0].relations = [{ type: 'souvisi', target_id: 'synthetic-complaint' }];
  registry.documents[0].evidence_note = 'tyto samostatné soubory nebyly s tímto PDF poskytnuty';
  const errors = validateFinalOkteRelations(registry, annexes);
  assert.equal(errors.length, 2);
  assert.match(errors.join(' '), /forward annex relations/);
  assert.match(errors.join(' '), /obsolete/);
});

test('reject missing annex reverse link, missing PDF and duplicated forward link', () => {
  const { annexes, registry } = make();
  registry.documents[1].relations = [];
  registry.documents[2].public.pdf = null;
  registry.documents[0].relations[1].target_id = registry.documents[0].relations[0].target_id;
  assert.equal(validateFinalOkteRelations(registry, annexes).length, 3);
});
