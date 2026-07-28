import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const [articleCs, articleEn, homeCs, homeEn, churchCs, churchEn, feed, archiveCs, archiveEn] = await Promise.all([
  readFile('web/zpravy/27072026-008.html', 'utf8'),
  readFile('web/news/27072026-008.html', 'utf8'),
  readFile('web/index.html', 'utf8'),
  readFile('web/en.html', 'utf8'),
  readFile('web/kc/index.html', 'utf8'),
  readFile('web/kc/en.html', 'utf8'),
  readFile('web/news-feed.js', 'utf8'),
  readFile('web/zpravy/index.html', 'utf8'),
  readFile('web/news/index.html', 'utf8')
]);

for (const page of [articleCs, homeCs, churchCs, feed, archiveCs]) {
  assert.match(page, /27072026-008/, 'REPORT 27072026-008 must be present in every Czech news surface');
  assert.match(page, /Pavouk český křižák z Branibor/, 'The approved Czech headline must be preserved');
}
for (const page of [articleEn, homeEn, churchEn, feed, archiveEn]) {
  assert.match(page, /27072026-008/, 'REPORT 27072026-008 must be present in every English news surface');
  assert.match(page, /orb-weaver from Branibor/, 'The English report title must remain discoverable');
}

assert.match(articleCs, /Praha → Brno → Praha/);
assert.match(articleCs, /3 KZN 197\/2026/);
assert.match(articleCs, /3 ZN 140\/2026/);
assert.match(articleCs, /1 VZN 1678\/2026/);
assert.match(articleCs, /včetně všech \(3\)/, 'The exact Brno return quotation must remain visible');
assert.match(articleCs, /Neobsahuje/, 'The exact incomplete-file quotation must remain visible');
assert.match(articleCs, /Nejde o nový izolovaný podnět/, 'The exact NSZ supplement quotation must remain visible');
assert.match(articleCs, /Pět listin za jediný den/, 'All five records dated 27 July must be presented together');
assert.match(articleCs, /nedokládá nezákonnost, trestný čin ani odpovědnost/, 'The procedural evidence boundary must remain prominent');
assert.match(articleCs, /Nejde o redakční závěr, že zákon právě takovou lhůtu ukládá/, 'The author-set period must not be presented as an automatic statutory deadline');
assert.match(articleCs, /38 jedinečných zdrojových PDF/);
assert.match(articleCs, /39\. dokument/);
assert.match(articleEn, /does not designate an individual/);
assert.match(articleEn, /does not automatically establish that the outcome was unlawful/);
assert.match(articleEn, /does not treat that period as an automatically applicable statutory deadline/);
assert.match(articleEn, /Five records in one day/, 'The English report must present all five records dated 27 July');

const allPdfLinks = [...articleCs.matchAll(/href="(documents\/[^"]+\.pdf)"/g)].map(match => match[1]);
const pdfLinks = [...new Set(allPdfLinks)];
assert.equal(pdfLinks.length, 39, 'The Czech report must link exactly 38 unique source PDFs plus the NSZ supplement');
assert.equal(
  new Set([...articleEn.matchAll(/href="(documents\/[^"]+\.pdf)"/g)].map(match => match[1])).size,
  39,
  'The English report must expose the same 39 direct PDF links'
);

const hashes = new Set();
for (const href of pdfLinks) {
  const file = path.join('web', href);
  await access(file);
  const bytes = await readFile(file);
  assert.ok(bytes.subarray(0, 5).toString() === '%PDF-', `${href} must be a readable PDF`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.ok(!hashes.has(digest), `${href} must not duplicate another linked source`);
  hashes.add(digest);
}

assert.ok(
  pdfLinks.some(href => href.endsWith('39-nsz-doplneni-predzalobni-vyzvy-2026-07-27.pdf')),
  'The 27 July NSZ supplement must be the highlighted 39th document'
);

console.log('News report 27072026-008: bilingual publication, 39 unique PDFs and evidence boundaries passed');
