import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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

const [css, entryPoint] = await Promise.all([
  readFile('web/newsroom.css', 'utf8'),
  readFile('web/styles.css', 'utf8'),
]);
const pages = (await walk('web')).filter(file => file.endsWith('.html'));

assert.match(css, /CannaInsider newsroom v9/);
assert.match(
  entryPoint,
  /@import url\("newsroom\.css"\);[\s\S]*@import url\("styles-legacy\.css"\);/,
  'The stable styles.css entry point must load the newsroom layer and historical base',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.nav\s*\{[\s\S]*display:\s*flex[\s\S]*overflow-x:\s*auto/,
  'Phone navigation must remain one horizontally scrollable news row',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.lead-card\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  'The lead story must collapse to one real phone column',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.lead-card > div\s*\{[\s\S]*order:\s*1[\s\S]*\.lead-card figure\s*\{[\s\S]*order:\s*2/,
  'The phone headline must appear before its lead image',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.lead-card figure\s*\{[\s\S]*aspect-ratio:\s*4\s*\/\s*3/,
  'Phone lead images must have a bounded aspect ratio',
);
assert.match(
  css,
  /\.article-header::after\s*\{[\s\S]*display:\s*none/,
  'Article mastheads must not duplicate the heart already present in the site masthead',
);
assert.match(
  css,
  /@media \(max-width: 720px\)[\s\S]*\.article-body\s*\{[\s\S]*font-size:\s*1\.06rem[\s\S]*line-height:\s*1\.72/,
  'Long articles must retain a readable phone measure',
);

for (const file of pages) {
  const html = await readFile(file, 'utf8');
  assert.match(
    html,
    /<link[^>]+href="brand\.css"/i,
    `${file} must retain the stable public stylesheet entry point`,
  );
  assert.doesNotMatch(
    html,
    /<link[^>]+href="newsroom\.css"/i,
    `${file} must not change its published HTML identity to load the new newsroom layer`,
  );
}

console.log(`Newsroom responsive v9: ${pages.length} pages use the production layout contract`);
