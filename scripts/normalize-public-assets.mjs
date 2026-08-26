import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'web';
const sharedStyles = new Set([
  'styles.css', 'brand.css', 'latest-records.css', 'language-menu.css',
  'shell-axis.css', 'process-timers.css', 'live-dockets.css',
  'home-rollups.css', 'layout-fix.css'
]);
const sharedScripts = new Set([
  'auto-translate.js', 'live-dockets.js', 'news-feed.js', 'site-search.js'
]);

const assetName = value => {
  const clean = String(value || '').split('#')[0].split('?')[0];
  return clean.split('/').filter(Boolean).at(-1) || '';
};

function dedupeKnownTags(html, file) {
  const seen = new Set();
  let removed = 0;

  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
    const name = assetName(href);
    if (!sharedStyles.has(name)) return tag;
    const key = `style:${name}`;
    if (seen.has(key)) {
      removed += 1;
      return '';
    }
    seen.add(key);
    return tag;
  });

  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
    const name = assetName(src);
    if (!sharedScripts.has(name)) return tag;
    const key = `script:${name}`;
    if (seen.has(key)) {
      removed += 1;
      return '';
    }
    seen.add(key);
    return tag;
  });

  let baseSeen = false;
  html = html.replace(/<base\b[^>]*>/gi, tag => {
    if (!baseSeen) {
      baseSeen = true;
      return tag;
    }
    removed += 1;
    return '';
  });

  return { html, removed, file };
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let totalRemoved = 0;
let touched = 0;
for (const file of await walk(ROOT)) {
  const original = await readFile(file, 'utf8');
  const result = dedupeKnownTags(original, file);
  if (result.html !== original) {
    await writeFile(file, result.html, 'utf8');
    touched += 1;
    totalRemoved += result.removed;
  }
}

console.log(`Normalizace veřejných assetů: ${touched} HTML souborů změněno, ${totalRemoved} duplicitních tagů odstraněno.`);
