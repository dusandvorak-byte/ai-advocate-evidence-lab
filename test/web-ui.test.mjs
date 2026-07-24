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
assert.match(
  await readFile('web/brand.css', 'utf8'),
  /footer::after[\s\S]*konopi-je-lek-logo\.jpg/,
  'The alliance logo must remain in the CannaInsider footer'
);
await access('web/assets/qr-dar-educational-cannabis-clinic.png');

const workflow = await readFile('.github/workflows/pages.yml', 'utf8');
assert.match(workflow, /path:\s*web/, 'GitHub Pages must publish only web/');

console.log('Web UI tests: 4 pages and deployment scope passed');
