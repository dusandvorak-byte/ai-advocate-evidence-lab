import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNavigationPages } from '../scripts/validate-public-navigation.mjs';

const ids = [
 'doc-cz-ekk-2026-11-03-nsz-dukazni-doplneni',
 'doc-cz-dd-2026-11-04-os-pro-stiznosti-obhajoba',
 'doc-cz-dd-2026-11-03-okte-srovnavaci-analyza',
 'doc-cz-ekk-2026-11-03-stiznost-krpm-145410',
 'doc-cz-dd-2026-11-04-cak-urgence-advokata',
];

const fixture = () => {
  const documents = ids.map((id, index) => ({
    id,
    submission_side: index % 2 === 0
      ? 'outgoing_from_user_or_alliance'
      : 'incoming_from_state_or_public_institution',
  }));
  const cz = ids.map(id => `<tr id="${id}" data-slalom-id="${id}--recipient"><td>Example</td></tr>`).join('')
    + '<section id="justicni-slalom"></section><section id="chronologie"></section>'
    + '<a href="/ai-advocate-evidence-lab/news/04082026-010.html" hreflang="en">English chronology</a>';
  const details = Object.fromEntries(ids.map((id, index) => {
    const outgoing = documents[index].submission_side === 'outgoing_from_user_or_alliance';
    const fragment = index < 2 ? id : (outgoing ? 'justicni-slalom' : 'chronologie');
    const label = fragment === 'justicni-slalom'
      ? 'Přejít na přehled podání'
      : fragment === 'chronologie'
        ? 'Přejít na přehled chronologie'
        : 'Zpět do chronologie';
    return [id, `<a href="zpravy/04082026-010.html#${fragment}">${label}</a>`
      + (id.includes('okte-srovnavaci') ? '<a>Otevřít redigovanou veřejnou kopii PDF</a>' : '')];
  }));
  return {
    cz,
    en: '<a href="zpravy/04082026-010.html" hreflang="cs">Czech canonical chronology →</a><h3><a hreflang="en">The Supreme Court forwarded the complaint</a></h3>',
    churchEn: '<h3><a hreflang="en">The Supreme Court forwarded the complaint</a></h3>',
    details,
    documents,
  };
};

test('accept exact filing rows plus safe outgoing/chronology fallbacks with truthful labels', () => {
  assert.deepEqual(validateNavigationPages(fixture()), []);
});

test('reject broken fallback, missing row anchor and wrong Czech link on English homepage', () => {
  const data = fixture();
  data.cz = data.cz.replace(`id="${ids[0]}" data-slalom-id`, 'data-slalom-id');
  data.details[ids[2]] = data.details[ids[2]]
    .replace('#justicni-slalom', '#nonexistent')
    .replace('Přejít na přehled podání', 'Broken');
  data.en = data.en.replace('href="zpravy/04082026-010.html"', 'href="news/04082026-010.html"');
  assert.equal(validateNavigationPages(data).length, 3);
});
