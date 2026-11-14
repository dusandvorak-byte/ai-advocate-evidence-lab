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

const fixture = () => ({
  cz: ids.map(id => `<tr id="${id}" data-slalom-id="${id}--recipient"><td>Example</td></tr>`).join('')
    + '<a href="/ai-advocate-evidence-lab/news/04082026-010.html" hreflang="en">English chronology</a>',
  en: '<a href="zpravy/04082026-010.html" hreflang="cs">Czech canonical chronology →</a><h3><a hreflang="en">The Supreme Court forwarded the complaint</a></h3>',
  churchEn: '<h3><a hreflang="en">The Supreme Court forwarded the complaint</a></h3>',
  details: Object.fromEntries(ids.map(id => [id, `<a href="zpravy/04082026-010.html#${id}">Zpět do chronologie</a>`
      + (id.includes('okte-srovnavaci') ? '<a>Otevřít redigovanou veřejnou kopii PDF</a>' : '')])),
});

test('valid five row anchors, back-links, bilingual navigation and PDF labels', () => {
  assert.deepEqual(validateNavigationPages(fixture()), []);
});

test('detect missing link anchor and wrong Czech link on English homepage', () => {
  const data = fixture();
  data.cz = data.cz.replace(`id="${ids[0]}" data-slalom-id`, 'data-slalom-id');
  data.en = data.en.replace('href="zpravy/04082026-010.html"', 'href="news/04082026-010.html"');
  assert.equal(validateNavigationPages(data).length, 2);
});
