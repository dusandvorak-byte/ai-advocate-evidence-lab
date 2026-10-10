import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const css = await readFile('web/brand.css', 'utf8');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const phonePages = (await walk('web')).filter(file => file.endsWith('.html'));

assert.match(css, /Newsroom v5 — genuinely readable phone layout from 320px upward/);
assert.match(css, /-webkit-text-size-adjust:\s*100%/);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.nav\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.newsroom-alert\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.article-body\s*\{[\s\S]*font-size:\s*1\.125rem[\s\S]*line-height:\s*1\.72/,
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*footer\s*\{[\s\S]*font-size:\s*15px[\s\S]*line-height:\s*1\.62/,
);
assert.match(css, /@media \(max-width: 390px\)/);

const mobileLeadGuard = 'Mobile lead-card regression guard — 10 October 2026';
const guardIndex = css.lastIndexOf(mobileLeadGuard);
const desktopLeadIndex = css.lastIndexOf('grid-template-columns: minmax(300px, 1.08fr) minmax(0, 1fr)');
assert.ok(guardIndex > desktopLeadIndex, 'Mobile lead-card guard must come after the last desktop two-column lead rule');
assert.match(
  css.slice(guardIndex),
  /@media \(max-width: 980px\)[\s\S]*main:not\(\.article-shell\) > \.news-lead > \.lead-card:only-child[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  'Phone/tablet lead card must end as a single full-width column',
);
assert.match(
  css.slice(guardIndex),
  /\.lead-card:only-child > div[\s\S]*width:\s*100%[\s\S]*min-width:\s*0/,
  'Lead text column must be allowed to occupy the full mobile width',
);

for (const path of phonePages) {
  const html = await readFile(path, 'utf8');
  assert.match(
    html,
    /<meta[^>]+name="viewport"[^>]+content="width=device-width,\s*initial-scale=1"/i,
    `${path} must retain a true device-width viewport`,
  );
  const isRedirectStub = /<meta[^>]+http-equiv="refresh"/i.test(html);
  if (!isRedirectStub) {
    assert.match(
      html,
      /<link[^>]+href="(?:\.\.\/|\/ai-advocate-evidence-lab\/)?brand\.css(?:\?[^"]*)?"/i,
      `${path} must load the shared mobile stylesheet through a valid relative or project-root URL`,
    );
  }
}

console.log(`Mobile readability v5: ${phonePages.length} representative pages passed`);
