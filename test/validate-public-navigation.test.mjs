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
  const historicalId='doc-cz-ns-2026-11-03-zin-208-2026-postoupeni';
  const latestIds=[historicalId,'doc-state-2','doc-state-3'];
  documents.push(...latestIds.map((id,i)=>({id,issue_date:'2026-11-0'+(3-i),document_type:'state_record'})));
  const cards=latestIds.map(id=>'<article class="latest-record-card" data-document-id="'+id+'"><h3><a href="news/04082026-010.html#en-'+id+'" hreflang="en">'+(id===historicalId?'The Supreme Court forwarded the complaint':'Translated record')+'</a></h3></article>').join('');
  const englishChronology=latestIds.map(id=>'<tr id="en-'+id+'"><td>'+(id===historicalId?'Supreme Court forwards complaint about its information response to the data protection authority':'Translated record')+'</td></tr>').join('');
  return {
    cz,
    englishChronology,
    en: '<a href="zpravy/04082026-010.html" hreflang="cs">Czech canonical chronology →</a>'+cards,
    churchEn: cards,
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
  const errors = validateNavigationPages(data);
  assert.equal(errors.length, 4);
  assert.ok(errors.some(x => x.includes('Missing Justice Slalom row anchor')));
  assert.ok(errors.some(x => x.includes('Invalid detail return target')));
  assert.ok(errors.some(x => x.includes('incorrect EN target')));
});

test('historical translated record may leave latest three when newer records arrive',()=>{
  const data=fixture();
  const old='doc-cz-ns-2026-11-03-zin-208-2026-postoupeni';
  const newer=['doc-new-1','doc-new-2','doc-new-3'];
  data.documents.push(...newer.map((id,i)=>({id,issue_date:'2026-11-'+(23-i),document_type:'state_record'})));
  const cards=newer.map(id=>'<article class="latest-record-card" data-document-id="'+id+'"><h3><a href="news/04082026-010.html#en-'+id+'" hreflang="en">Translated new record</a></h3></article>').join('');
  data.en=data.en.replace(/<article class="latest-record-card"[\s\S]*$/ ,cards);
  data.churchEn=cards;
  data.englishChronology+=newer.map(id=>'<tr id="en-'+id+'"><td>Translated new record</td></tr>').join('');
  assert.deepEqual(validateNavigationPages(data),[]);
  data.englishChronology=data.englishChronology.replace('id="en-'+old+'"','id="missing"');
  assert.ok(validateNavigationPages(data).some(e=>e.includes('Missing historical NS Zin 208')));
});
test('reject stale latest card order and broken English target',()=>{
  const data=fixture();
  data.churchEn=data.churchEn.replace('hreflang="en"','hreflang="cs"');
  data.documents.push({id:'doc-new',issue_date:'2026-11-24',document_type:'state_record'});
  const errors=validateNavigationPages(data);
  assert.ok(errors.some(e=>e.includes('latest card IDs/order mismatch')));
  assert.ok(errors.some(e=>e.includes('invalid English latest card link')));
});
