import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('web/brand.css', 'utf8');
const report = await readFile('web/zpravy/25072026-007.html', 'utf8');

assert.match(css, /Newsroom v4 — reading rhythm, verifiable sources and mobile clarity/);
assert.match(css, /\.article-body \.source li[\s\S]*overflow-wrap:\s*anywhere/);
assert.match(css, /\.article-body \.source > p > a:only-child[\s\S]*min-height:\s*44px/);
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.nav[\s\S]*overflow-x:\s*auto/);
assert.match(css, /:where\(a, button, summary, input, select, textarea\):focus-visible/);
assert.match(css, /\.church-site \.article-body \.source[\s\S]*var\(--church-blue\)/);

assert.match(report, /class="article-body"/);
assert.match(report, /class="source"/);
assert.doesNotMatch(report, /SHA256SUMS\.txt/, 'The reader-facing article must not expose technical checksum copy');

console.log('Newsroom visual v4: source clarity, mobile navigation and focus states passed');
