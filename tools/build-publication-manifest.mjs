import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repositoryRoot, 'web');
const reportRoot = path.join(webRoot, 'zpravy');
const manifestPath = path.join(webRoot, 'publication-manifest.json');
const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const checkMode = args.includes('--check');
const bumpIds = new Set(
  args.flatMap((argument, index) => argument === '--bump' ? [args[index + 1]] : [])
    .filter(Boolean)
);

if (writeMode === checkMode) {
  throw new Error('Use exactly one of --write or --check.');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normaliseHref(href) {
  return href.split(/[?#]/, 1)[0].replace(/&amp;/g, '&');
}

function publicationDate(reportId) {
  const match = /^(\d{2})(\d{2})(\d{4})-\d{3}$/.exec(reportId);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

async function existingManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function buildEntry(filename, previous) {
  const reportId = path.basename(filename, '.html');
  const articleAbsolute = path.join(reportRoot, filename);
  const articleBytes = await readFile(articleAbsolute);
  const html = articleBytes.toString('utf8');
  const baseHref = html.match(/<base\s+href="([^"]+)"/i)?.[1];
  const baseDirectory = baseHref
    ? path.resolve(path.dirname(articleAbsolute), baseHref)
    : path.dirname(articleAbsolute);
  const sourceHrefs = [...html.matchAll(/\bhref="([^"]+\.pdf(?:[?#][^"]*)?)"/gi)]
    .map(match => normaliseHref(match[1]))
    .filter((href, index, values) => values.indexOf(href) === index);
  const sources = [];

  for (const href of sourceHrefs) {
    if (/^https:\/\//i.test(href)) {
      sources.push({ url: href, sha256: null });
      continue;
    }
    const absolute = path.resolve(baseDirectory, href);
    const relative = path.relative(webRoot, absolute).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) {
      throw new Error(`${reportId}: source escapes web/: ${href}`);
    }
    const sourceBytes = await readFile(absolute);
    if (sourceBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error(`${reportId}: linked source is not a PDF: ${relative}`);
    }
    sources.push({ path: relative, sha256: sha256(sourceBytes) });
  }

  const contentIdentity = JSON.stringify({
    articleSha256: sha256(articleBytes),
    sources
  });
  const previousIdentity = previous
    ? JSON.stringify({
        articleSha256: previous.articleSha256,
        sources: previous.sources
      })
    : null;
  const changed = previous && contentIdentity !== previousIdentity;
  if (changed && !bumpIds.has(reportId) && writeMode) {
    throw new Error(`${reportId}: published content changed; rerun with --bump ${reportId}`);
  }

  return {
    id: reportId,
    version: previous ? previous.version + (changed ? 1 : 0) : 1,
    publishedDate: publicationDate(reportId),
    article: `zpravy/${filename}`,
    articleSha256: sha256(articleBytes),
    sources
  };
}

const previous = await existingManifest();
const previousById = new Map((previous?.publications || []).map(item => [item.id, item]));
const filenames = (await readdir(reportRoot))
  .filter(filename => /^\d{8}-\d{3}\.html$/.test(filename))
  .sort();
const publications = [];

for (const filename of filenames) {
  const id = path.basename(filename, '.html');
  publications.push(await buildEntry(filename, previousById.get(id)));
}

for (const bumpId of bumpIds) {
  if (!publications.some(item => item.id === bumpId)) {
    throw new Error(`Unknown publication ID passed to --bump: ${bumpId}`);
  }
}

const manifest = {
  schema: 'cannainsider-versioned-publications',
  schemaVersion: 1,
  rule: 'Any change to a published article or its source set requires an explicit version bump.',
  publications
};
const serialised = `${JSON.stringify(manifest, null, 2)}\n`;

if (checkMode) {
  const current = await readFile(manifestPath, 'utf8');
  if (current !== serialised) {
    throw new Error('Publication manifest is stale or a published item changed without an explicit version bump.');
  }
  console.log(`Publication manifest verified: ${publications.length} versioned reports`);
} else {
  await writeFile(manifestPath, serialised, 'utf8');
  console.log(`Publication manifest written: ${publications.length} versioned reports`);
}
