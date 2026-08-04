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
  assert.match(page, /id="evidence-url-form"/, `${paths[index]} must offer external PDF intake`);
  assert.match(page, /type="url"/, `${paths[index]} must use a URL input`);
  assert.match(page, /CORS/, `${paths[index]} must disclose the static cross-origin boundary`);
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

const reporter = await readFile('web/reporter.js', 'utf8');
assert.match(reporter, /fetchExternalPdf/, 'The public UI must connect external PDF intake to the safe downloader');
assert.match(reporter, /renderGroundedGroup/, 'The UI must render source-grounded output groups');
assert.match(reporter, /Doložená fakta/, 'Facts must be visibly separated');
assert.match(reporter, /Pracovní zařazení a výklad/, 'Interpretation must be visibly separated');
assert.match(reporter, /Nejistoty a hranice/, 'Uncertainty must be visibly separated');
assert.match(reporter, /Návrhy řešení a dalších kontrol/, 'Proposed solutions must be visibly separated');
assert.match(reporter, /renderKnownIdentityFallback/, 'A known sample must retain exact identity if text extraction is unavailable');
assert.match(reporter, /bez citací ze zdroje nezobrazuje připravený výklad/, 'The known-sample fallback must not leak uncited interpretation');
assert.match(reporter, /data-publication-workflow/, 'A grounded analysis must expose the controlled publication path');
assert.match(reporter, /privacyAndRightsChecked/, 'Publication must require a privacy and publication-rights attestation');
assert.match(reporter, /legalReviewChecked/, 'Publication must require human legal review');
assert.match(reporter, /Repository review and tests are still required/, 'Browser approval must not be presented as publication');
assert.match(reporter, /issues\/new\?template=document-intake\.yml/, 'The workflow must connect to the public editorial intake');

const workflow = await readFile('.github/workflows/pages.yml', 'utf8');
assert.match(workflow, /path:\s*web/, 'GitHub Pages must publish only web/');

console.log('Web UI tests: 4 pages and deployment scope passed');
