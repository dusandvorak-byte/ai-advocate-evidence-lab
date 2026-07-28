import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repositoryRoot, 'web');
const args = process.argv.slice(2);
const networkMode = args.includes('--network');
const jsonIndex = args.indexOf('--json');
const jsonOutput = jsonIndex >= 0 ? args[jsonIndex + 1] : null;
const publicBaseUrl = process.env.PUBLIC_BASE_URL
  || 'https://dusandvorak-byte.github.io/ai-advocate-evidence-lab/';
const checks = [];

function record(kind, target, ok, detail) {
  checks.push({ kind, target, ok, detail });
}

function privateIp(address) {
  const value = address.toLowerCase();
  if (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  if (/^(?:0|10|127)\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)) return true;
  const private172 = /^172\.(\d{1,3})\./.exec(value);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

async function validatePublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('HTTPS is required');
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Credentials, query strings and fragments are not allowed in public source URLs');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local') || isIP(url.hostname) && privateIp(url.hostname)) {
    throw new Error('Local or private source address');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => privateIp(item.address))) {
    throw new Error('Source resolves to a local or private address');
  }
  return url;
}

async function fetchPublicSource(rawUrl) {
  let current = await validatePublicUrl(rawUrl);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: { Range: 'bytes=0-1023', 'User-Agent': 'CannaInsider-Source-Health/1.0' },
      signal: AbortSignal.timeout(20_000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`redirect ${response.status} without Location`);
      current = await validatePublicUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
    return `HTTP ${response.status}`;
  }
  throw new Error('too many redirects');
}

async function htmlFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await htmlFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.html')) found.push(absolute);
  }
  return found;
}

const localSources = new Map();
const externalSources = new Set();
for (const htmlPath of await htmlFiles(webRoot)) {
  const html = await readFile(htmlPath, 'utf8');
  const baseHref = html.match(/<base\s+href="([^"]+)"/i)?.[1];
  const baseDirectory = baseHref
    ? path.resolve(path.dirname(htmlPath), baseHref)
    : path.dirname(htmlPath);
  const sourceBlocks = [...html.matchAll(/<(?:details|section)[^>]*class="[^"]*\bsource\b[^"]*"[^>]*>([\s\S]*?)<\/(?:details|section)>/gi)];
  for (const block of sourceBlocks) {
    for (const match of block[1].matchAll(/\bhref="([^"]+)"/gi)) {
      const href = match[1].replace(/&amp;/g, '&');
      if (/^https:\/\//i.test(href)) {
        externalSources.add(href);
      } else if (/\.pdf(?:[?#].*)?$/i.test(href)) {
        const cleanHref = href.split(/[?#]/, 1)[0];
        const absolute = path.resolve(baseDirectory, cleanHref);
        const relative = path.relative(webRoot, absolute).split(path.sep).join('/');
        localSources.set(relative, absolute);
      }
    }
  }
}

for (const [relative, absolute] of [...localSources].sort()) {
  try {
    const details = await stat(absolute);
    const bytes = await readFile(absolute);
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('invalid PDF signature');
    record('local-pdf', relative, true, `${details.size} bytes; sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
  } catch (error) {
    record('local-pdf', relative, false, error.message);
  }
}

for (const url of [...externalSources].sort()) {
  if (!networkMode) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error('unsafe public source URL');
      }
      record('external-url', url, true, 'syntax checked; network check skipped');
    } catch (error) {
      record('external-url', url, false, error.message);
    }
    continue;
  }
  try {
    record('external-url', url, true, await fetchPublicSource(url));
  } catch (error) {
    record('external-url', url, false, error.message);
  }
}

if (networkMode) {
  const manifest = JSON.parse(await readFile(path.join(webRoot, 'publication-manifest.json'), 'utf8'));
  const deployedPaths = new Set([
    ...manifest.publications.map(publication => publication.article),
    ...localSources.keys()
  ]);
  for (const relative of [...deployedPaths].sort()) {
    const deployedUrl = new URL(relative, publicBaseUrl).href;
    try {
      record('deployed-source', deployedUrl, true, await fetchPublicSource(deployedUrl));
    } catch (error) {
      record('deployed-source', deployedUrl, false, error.message);
    }
  }
}

const summary = {
  checkedAt: new Date().toISOString(),
  mode: networkMode ? 'network' : 'local',
  total: checks.length,
  passed: checks.filter(check => check.ok).length,
  failed: checks.filter(check => !check.ok).length,
  checks
};

if (jsonOutput) await writeFile(jsonOutput, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`Public source health: ${summary.passed}/${summary.total} passed (${summary.mode})`);
for (const check of checks.filter(item => !item.ok)) {
  console.error(`FAIL ${check.kind} ${check.target}: ${check.detail}`);
}
if (summary.failed) process.exitCode = 1;
