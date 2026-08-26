import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

await import('./normalize-public-assets.mjs');

const ROOT = 'web';
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const registry = await readJson('project-memory/documents-2026.json');
if (!Array.isArray(registry.documents)) throw new Error('Kanonický registr neobsahuje documents');

const stateDocs = registry.documents.filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record');
const stateCount = stateDocs.length;

const criticalHtml = [
  'web/index.html',
  'web/en.html',
  'web/kc/index.html',
  'web/kc/en.html',
  'web/zpravy/index.html',
  'web/news/index.html',
  'web/zpravy/04082026-010.html',
  'web/news/04082026-010.html'
];

const sharedStyles = [
  'styles.css', 'brand.css', 'latest-records.css', 'language-menu.css',
  'shell-axis.css', 'process-timers.css', 'live-dockets.css', 'home-rollups.css', 'layout-fix.css'
];
const sharedScripts = ['auto-translate.js', 'live-dockets.js', 'news-feed.js', 'site-search.js'];

const basenameNoQuery = value => String(value || '').split('#')[0].split('?')[0].split('/').filter(Boolean).at(-1) || '';
const countAsset = (html, name) => {
  const pattern = name.endsWith('.css')
    ? /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
    : /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let count = 0;
  for (const match of html.matchAll(pattern)) if (basenameNoQuery(match[1]) === name) count += 1;
  return count;
};

for (const file of criticalHtml) {
  await access(file);
  const html = await readFile(file, 'utf8');
  const baseCount = (html.match(/<base\b/gi) || []).length;
  if (baseCount > 1) throw new Error(`${file}: více než jeden <base> (${baseCount})`);
  for (const name of [...sharedStyles, ...sharedScripts]) {
    const count = countAsset(html, name);
    if (count > 1) throw new Error(`${file}: duplicitní ${name} (${count}×)`);
  }
}

const czGodot = await readFile('web/zpravy/04082026-010.html', 'utf8');
const enGodot = await readFile('web/news/04082026-010.html', 'utf8');
const renderedCz = (czGodot.match(/<li id="doc-[^"]+"/g) || []).length;
const renderedEn = (enGodot.match(/data-document-id="doc-[^"]+"/g) || []).length;
if (renderedCz !== stateCount) throw new Error(`CZ Godot ${renderedCz}/${stateCount}`);
if (renderedEn !== stateCount) throw new Error(`EN Godot ${renderedEn}/${stateCount}`);
if (!czGodot.includes(`Stát: ${stateCount} evidovaných listin`)) throw new Error('CZ Godot nemá kanonický počet');
if (!enGodot.includes(`${stateCount} source-linked records`) && !enGodot.includes(`${stateCount} source-linked Czech public records`)) {
  throw new Error('EN Godot nemá kanonický počet');
}

for (const file of ['web/index.html', 'web/en.html', 'web/kc/index.html', 'web/kc/en.html']) {
  const html = await readFile(file, 'utf8');
  if (!html.includes(String(stateCount))) throw new Error(`${file}: chybí aktuální kanonický počet ${stateCount}`);
  if (!html.includes('latest-records')) throw new Error(`${file}: chybí latest-records`);
}

const publicPdfDocs = registry.documents.filter(item => item.public?.pdf);
for (const item of publicPdfDocs) {
  const rel = String(item.public.pdf).replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');
  const file = path.join(ROOT, rel);
  await access(file).catch(() => { throw new Error(`Chybí veřejné PDF ${item.id}: ${rel}`); });
  const bytes = await readFile(file);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error(`Neplatné PDF ${item.id}: ${rel}`);
}

const newsFeed = await readFile('web/news-feed.js', 'utf8');
for (const [, href] of newsFeed.matchAll(/href:\s*['"]([^'"]+\.html)['"]/g)) {
  const file = path.join(ROOT, href.replace(/^\/+/, '').replace(/^ai-advocate-evidence-lab\//, ''));
  await access(file).catch(() => { throw new Error(`CZ článek ve feedu neexistuje: ${href}`); });
}
for (const [, hrefEn] of newsFeed.matchAll(/hrefEn:\s*['"]([^'"]+\.html)['"]/g)) {
  const file = path.join(ROOT, hrefEn.replace(/^\/+/, '').replace(/^ai-advocate-evidence-lab\//, ''));
  await access(file).catch(() => { throw new Error(`EN článek ve feedu neexistuje: ${hrefEn}`); });
}

const hrefTargets = [];
for (const file of criticalHtml) {
  const html = await readFile(file, 'utf8');
  const baseHref = html.match(/<base\b[^>]*href=["']([^"']+)["']/i)?.[1] || null;
  const dir = path.dirname(file);
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (!raw || raw.startsWith('#') || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    let target;
    if (clean.startsWith('/ai-advocate-evidence-lab/')) target = path.join(ROOT, clean.slice('/ai-advocate-evidence-lab/'.length));
    else if (clean.startsWith('/')) continue;
    else if (baseHref && !baseHref.startsWith('http') && !baseHref.startsWith('/')) target = path.normalize(path.join(dir, baseHref, clean));
    else target = path.normalize(path.join(dir, clean));
    hrefTargets.push([file, raw, target]);
  }
}
for (const [source, raw, target] of hrefTargets) {
  await access(target).catch(() => { throw new Error(`${source}: rozbitý interní odkaz ${raw} → ${target}`); });
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

let duplicateSharedAssetPages = 0;
for (const file of await walk(ROOT)) {
  const html = await readFile(file, 'utf8');
  for (const name of [...sharedStyles, ...sharedScripts]) {
    if (countAsset(html, name) > 1) {
      duplicateSharedAssetPages += 1;
      throw new Error(`${file}: globální audit našel duplicitní ${name}`);
    }
  }
}

console.log(`Publikační integrita OK: ${stateCount} státních listin CZ/EN, ${publicPdfDocs.length} veřejných PDF, články feedu existují, kritické interní odkazy fungují, duplicitní sdílené assety: ${duplicateSharedAssetPages}.`);
