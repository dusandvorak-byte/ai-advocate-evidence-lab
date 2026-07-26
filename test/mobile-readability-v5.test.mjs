import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('web/brand.css', 'utf8');
const phonePages = [
  'web/index.html',
  'web/en.html',
  'web/kc/index.html',
  'web/kc/en.html',
  'web/zpravy/index.html',
  'web/news/index.html',
  'web/zpravy/25072026-007.html',
];

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

for (const path of phonePages) {
  const html = await readFile(path, 'utf8');
  assert.match(
    html,
    /<meta[^>]+name="viewport"[^>]+content="width=device-width,\s*initial-scale=1"/i,
    `${path} must retain a true device-width viewport`,
  );
  assert.match(
    html,
    /<link[^>]+href="brand\.css"/i,
    `${path} must load the shared mobile stylesheet`,
  );
}

console.log(`Mobile readability v5: ${phonePages.length} representative pages passed`);
