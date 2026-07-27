import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [archive, englishArchive, feedSource, searchSource, reporterSource, home, englishHome, css] = await Promise.all([
  readFile('web/zpravy/index.html', 'utf8'),
  readFile('web/news/index.html', 'utf8'),
  readFile('web/news-feed.js', 'utf8'),
  readFile('web/site-search.js', 'utf8'),
  readFile('web/reporter.js', 'utf8'),
  readFile('web/index.html', 'utf8'),
  readFile('web/en.html', 'utf8'),
  readFile('web/brand.css', 'utf8')
]);

const reportIds = [...new Set([...archive.matchAll(/REPORT\s+(\d{8}-\d{3})/g)].map(match => match[1]))];
assert.ok(reportIds.length >= 6, 'The public archive must expose all approved reports');
for (const id of reportIds) {
  assert.match(feedSource, new RegExp(id), `${id} must be present in the shared discovery source`);
}
const feedIds = [...new Set([...feedSource.matchAll(/id:\s*'(\d{8}-\d{3})'/g)].map(match => match[1]))];
for (const id of feedIds) {
  assert.match(archive, new RegExp(`REPORT\\s+${id}`), `${id} must remain present in the Czech archive`);
  assert.match(englishArchive, new RegExp(`REPORT\\s+${id}`), `${id} must remain present in the English archive`);
}

const feed = {
  dataset: { excludeIds: '25072026-007 24072026-006 24072026-005' },
  innerHTML: ''
};
const context = {
  window: {},
  document: {
    documentElement: { lang: 'cs' },
    querySelector: selector => selector === '[data-shared-news-feed]' ? feed : null
  }
};
vm.runInNewContext(feedSource, context);

for (const featured of ['25072026-007', '24072026-006', '24072026-005']) {
  assert.doesNotMatch(feed.innerHTML, new RegExp(featured), `${featured} must not be duplicated below the lead grid`);
}
for (const additional of ['23072026-004', '22072026-002', '20072026-001']) {
  assert.match(feed.innerHTML, new RegExp(additional), `${additional} must remain discoverable below the lead grid`);
}

assert.doesNotMatch(searchSource, /entries\.push/, 'Search must use the canonical report source without hand-maintained duplicates');
assert.match(searchSource, /keywordsEn/);
assert.match(searchSource, /keywordsCs/);
assert.match(searchSource, /querySelector\('\.news-lead, \.lead-grid'\)/, 'Front-page search must follow the lead stories instead of pushing them below the fold');
assert.match(feedSource, /item\.hrefEn \|\| item\.href/, 'English discovery must prefer an available English report');
assert.match(feedSource, /hreflang="cs"/, 'English discovery must label links that lead to Czech-only reports');
for (const [page, label] of [[archive, 'Czech'], [englishArchive, 'English']]) {
  assert.match(page, /site-search\.js/, `${label} archive must offer full report search`);
  assert.match(page, /news-feed\.js/, `${label} archive search must use the canonical report source`);
}

for (const page of [home, englishHome]) {
  assert.match(page, /class="deadline-watch"/, 'Both front pages must show source-bound tracked dates');
  assert.match(page, /data-watch-until="2026-08-20T23:59:59\+02:00"/);
  assert.match(page, /data-watch-until="2026-08-31T23:59:59\+02:00"/);
  assert.match(page, /not automatically statutory deadlines|nikoli automaticky o zákonné lhůty/);
}

assert.match(reporterSource, /Termín uplynul — ověřte aktuální stav/);
assert.match(reporterSource, /Date passed — check the current status/);
assert.match(css, /Newsroom v6 — complete report discovery and source-bound date tracking/);
assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.deadline-grid/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.context-grid/);

console.log(`Newsroom discovery v6: ${reportIds.length} reports, de-duplication and tracked dates passed`);
