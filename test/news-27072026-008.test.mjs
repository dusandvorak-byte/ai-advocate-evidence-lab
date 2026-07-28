import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const [articleCs, articleEn, homeCs, homeEn, feed, archiveCs, archiveEn] = await Promise.all([
  readFile('web/zpravy/27072026-008.html', 'utf8'),
  readFile('web/news/27072026-008.html', 'utf8'),
  readFile('web/index.html', 'utf8'),
  readFile('web/en.html', 'utf8'),
  readFile('web/news-feed.js', 'utf8'),
  readFile('web/zpravy/index.html', 'utf8'),
  readFile('web/news/index.html', 'utf8')
]);

for (const page of [articleCs, feed, archiveCs]) {
  assert.match(page, /27072026-008/, 'REPORT 27072026-008 must remain discoverable in Czech');
  assert.match(page, /Praha–Brno–Praha: kdo převezme věcné vyřízení\?/);
}
for (const page of [articleEn, feed, archiveEn]) {
  assert.match(page, /27072026-008/, 'REPORT 27072026-008 must remain discoverable in English');
  assert.match(page, /Prague–Brno–Prague: who will take substantive responsibility\?/);
}

assert.doesNotMatch(articleCs, /Pavouk český křižák z Branibor/);
assert.doesNotMatch(articleEn, /orb-weaver from Branibor/);
assert.doesNotMatch(articleCs, /Lence Bradáčové s láskou on-line/);
assert.doesNotMatch(articleEn, /To Lenka Bradáčová, with love — online/);

assert.match(articleCs, /id="pavouk"/, 'The procedural map must remain present');
assert.equal(
  [...articleCs.matchAll(/class="web-node"/g)].length,
  5,
  'The procedural map must show all five records dated 27 July'
);
assert.match(articleCs, /3 KZN 197\/2026/);
assert.match(articleCs, /3 ZN 140\/2026/);
assert.match(articleCs, /1 VZN 1678\/2026/);
assert.match(articleCs, /Městské státního zastupitelství/, 'The source wording, including its grammatical form, must not be silently corrected');
assert.match(articleCs, /Procesní předávání[^<]+avšak žádný z nich je nepřevezme k věcnému posouzení/);
assert.match(articleCs, /Nová listina sama[^<]+; prokazuje však/);
assert.match(articleCs, /Neobsahuje/);
assert.match(articleCs, /Nejde o nový izolovaný podnět/);
assert.match(articleCs, /Nejde o redakční závěr, že zákon právě takovou lhůtu ukládá/);

assert.equal(
  [...articleEn.matchAll(/<blockquote lang="cs">/g)].length,
  3,
  'English quotations must show the exact Czech source text'
);
assert.equal(
  [...articleEn.matchAll(/Unofficial English translation:/g)].length,
  3,
  'Every English translation of a quotation must be labelled'
);

for (const page of [homeCs, articleCs]) {
  assert.match(page, /demonstrační důkazní prototyp/i);
  assert.match(page, /není právní rad|nenahrazuje právní radu|nikoli právní radu/);
  assert.match(page, /lidskou kontrol|člověk vždy ověřit/i);
}
for (const page of [homeEn, articleEn]) {
  assert.match(page, /demonstration evidence prototype/i);
  assert.match(page, /not legal advice/i);
  assert.match(page, /human/i);
}

assert.match(articleCs, /28 nových PDF/);
assert.match(articleEn, /28 new PDFs/);
assert.match(articleCs, /Jedenáct dříve zveřejněných/);
assert.match(articleEn, /Eleven identical records/);
assert.match(articleCs, /osobní údaje třetích osob/);
assert.match(articleEn, /third-party personal data/);
assert.match(articleCs, /aktivní obsah a vloženou přílohu/);
assert.match(articleEn, /active content and an embedded attachment/);

const report008PdfLink = /href="documents\/report-27072026-008\/[^"]+\.pdf"/;
assert.doesNotMatch(articleCs, report008PdfLink, 'No new REPORT 008 PDF may be linked before redaction');
assert.doesNotMatch(articleEn, report008PdfLink, 'No new REPORT 008 PDF may be linked before redaction');

const linkedPriorPdfsCs = new Set(
  [...articleCs.matchAll(/href="(documents\/report-25072026-007\/[^"]+\.pdf)"/g)]
    .map(match => match[1])
);
const linkedPriorPdfsEn = new Set(
  [...articleEn.matchAll(/href="(documents\/report-25072026-007\/[^"]+\.pdf)"/g)]
    .map(match => match[1])
);
assert.equal(linkedPriorPdfsCs.size, 11, 'Only the eleven previously published duplicate records may stay linked');
assert.deepEqual(linkedPriorPdfsEn, linkedPriorPdfsCs, 'Both language versions must expose the same prior public copies');

for (const href of linkedPriorPdfsCs) {
  await access(`web/${href}`);
}

await assert.rejects(
  access('web/documents/report-27072026-008'),
  'The sanitized branch must not contain the newly submitted PDF directory'
);

console.log('News report 27072026-008: privacy gate, exact quotations and prototype boundaries passed');
