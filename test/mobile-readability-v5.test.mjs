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
assert.match(
  css,
  /Newsroom v8 — mobile layout contract, including the article-heart placement/,
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.article-header\s*\{[\s\S]*padding-top:\s*0[\s\S]*padding-right:\s*0/,
  'Article headers must not reserve an empty strip above phone headlines',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.article-header::after\s*\{[\s\S]*position:\s*static[\s\S]*margin:\s*18px 0 0/,
  'The article heart must follow the metadata instead of overlapping the phone header',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.score\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)[\s\S]*width:\s*100%/,
  'Long relevance labels must remain inside the phone viewport',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.lead-card figure img\s*\{[\s\S]*aspect-ratio:\s*4\s*\/\s*3/,
  'The lead image must use a bounded phone aspect ratio',
);
assert.match(
  css,
  /@media \(max-width: 390px\)[\s\S]*\.news-card\.with-image\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  'Image cards must stack at the narrowest supported width',
);

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
