import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const paths = [
  'web/index.html',
  'web/en.html',
  'web/kc/index.html',
  'web/kc/en.html'
];
const pages = await Promise.all(paths.map(path => readFile(path, 'utf8')));

for (const [index, page] of pages.entries()) {
  assert.match(page, /site-search\.js/, `${paths[index]} must load shared search`);
  assert.match(page, /qr-dar-educational-cannabis-clinic\.png/, `${paths[index]} must show the QR support panel`);
  assert.doesNotMatch(page, /Luk[aá][sš]\s+Chud/i, `${paths[index]} must not publish the Lukáš Chudý material`);
}

assert.doesNotMatch(
  pages[0],
  /class="site-logo"/,
  'The alliance logo must not appear in the CannaInsider masthead'
);
const css = await readFile('web/brand.css', 'utf8');
assert.match(
  css,
  /footer::after[\s\S]*konopi-je-lek-logo\.jpg/,
  'The alliance logo must remain in the CannaInsider footer'
);
assert.doesNotMatch(
  css,
  /body:not\(\.church-site\) \.brand-promise p::before/,
  'The masthead question must come from HTML once, not be duplicated by generated CSS content'
);
assert.match(pages[0], /class="capabilities-panel"/, 'The Czech front page must disclose the platform roadmap');
assert.match(pages[0], /Na webu funguje dnes/, 'Current functions must be distinguished from the roadmap');
assert.match(pages[0], /Přidaná hodnota ve vývoji/, 'Planned functions must be labelled as in development');
assert.match(pages[1], /class="capabilities-panel"/, 'The English front page must disclose the platform roadmap');
assert.match(pages[1], /Available today/, 'The English page must distinguish current functions');
assert.match(pages[1], /Added value in development/, 'The English page must distinguish planned functions');
assert.doesNotMatch(pages[0], /href="kc\/index\.html"/, 'The Czech CannaInsider navigation must not link to Cannabis Church');
assert.doesNotMatch(pages[1], /href="kc\/en\.html"/, 'The English CannaInsider navigation must not link to Cannabis Church');
assert.match(pages[0], /Bude konopná amnestie\?/, 'The Czech CannaInsider masthead must use the amnesty question');
assert.match(pages[1], /Will there be a cannabis amnesty\?/, 'The English CannaInsider masthead must use the amnesty question');
await access('web/assets/qr-dar-educational-cannabis-clinic.png');

const workflow = await readFile('.github/workflows/pages.yml', 'utf8');
assert.match(workflow, /path:\s*web/, 'GitHub Pages must publish only web/');

console.log('Web UI tests: 4 pages and deployment scope passed');
