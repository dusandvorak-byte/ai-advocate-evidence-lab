import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const article = await readFile('web/zpravy/25072026-007.html', 'utf8');
const home = await readFile('web/index.html', 'utf8');
const church = await readFile('web/kc/index.html', 'utf8');
const feed = await readFile('web/news-feed.js', 'utf8');

for (const page of [article, home, church, feed]) {
  assert.match(page, /25072026-007/, 'Report 25072026-007 must be present in every shared-news surface');
  assert.match(page, /Lence Bradáčové s láskou/, 'The approved Czech headline must be preserved');
}

assert.match(article, /1 VZN 1678\/2026-70/, 'The VSZ source reference must be exact');
assert.match(article, /6 NZN 1737\/2026-32/, 'The NSZ source reference must be exact');
assert.match(article, /3 VZN 239\/2026-27/, 'The VSZ Olomouc source reference must be exact');
assert.match(article, /1 KZT 475\/2026-32/, 'The KSZ Brno source reference must be exact');
assert.match(article, /4 KZN 7116\/2026-45/, 'The KSZ Ostrava source reference must be exact');
assert.match(article, /1 ZT 11\/2010-752/, 'The OSZ Prostějov source reference must be exact');
assert.match(article, /Balík NSZ a NCOZ/, 'Cumulative filings must be grouped by procedural branch');
assert.match(article, /20\. 4\..*25\. 4\..*8\. 5\..*12\. 5\. 2026/s, 'The cumulative NSZ filing dates must remain visible');
assert.match(article, /2 KZN 55\/2025-122/, 'The reference shown in the MSZ letter header must remain visible');
assert.match(article, /2 KZN 55\/2026/, 'The different reference shown in the MSZ letter body must remain visible');
assert.match(article, /KRPM-100092-2\/ČJ-2026-1412UO/, 'The police notice reference must be exact');
assert.match(article, /zaslaná Dušanem Dvořákem policii dne 14\. 7\./, 'The police branch must not invent an NSZ referral');
assert.match(article, /Neurčuje vinu a nezaručuje výsledek/, 'The relevance boundary must remain visible');
assert.match(article, /automaticky neprokazují trestný čin/, 'The procedural-action safety boundary must remain visible');
assert.doesNotMatch(article, /předžalobni-vyzva.*href=/i, 'The privacy-unchecked pre-action demand must not be linked');

console.log('News report 25072026-007: shared publication and source boundaries passed');
