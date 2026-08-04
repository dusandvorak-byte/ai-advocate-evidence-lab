import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';

const manifestCheck = spawnSync(
  process.execPath,
  ['tools/build-publication-manifest.mjs', '--check'],
  { encoding: 'utf8' }
);
assert.equal(manifestCheck.status, 0, manifestCheck.stderr || manifestCheck.stdout);
assert.match(manifestCheck.stdout, /versioned reports/);

const manifest = JSON.parse(await readFile('web/publication-manifest.json', 'utf8'));
assert.equal(manifest.schema, 'cannainsider-versioned-publications');
assert.ok(manifest.publications.length >= 6);
for (const publication of manifest.publications) {
  assert.match(publication.id, /^\d{8}-\d{3}$/);
  assert.ok(Number.isInteger(publication.version) && publication.version >= 1);
  assert.match(publication.articleSha256, /^[a-f0-9]{64}$/);
  for (const source of publication.sources) {
    if (source.path) assert.match(source.sha256, /^[a-f0-9]{64}$/);
  }
}

const sourceCheck = spawnSync(
  process.execPath,
  ['tools/check-public-sources.mjs'],
  { encoding: 'utf8' }
);
assert.equal(sourceCheck.status, 0, sourceCheck.stderr || sourceCheck.stdout);
assert.match(sourceCheck.stdout, /Public source health/);

const sourceCheckImplementation = await readFile('tools/check-public-sources.mjs', 'utf8');
assert.doesNotMatch(
  sourceCheckImplementation,
  /\bstat\s*\([^)]*\)[\s\S]{0,500}\breadFile\s*\(/,
  'Local source validation must not check a path and then reopen it for reading'
);
assert.match(
  sourceCheckImplementation,
  /const bytes = await readFile\(absolute\);[\s\S]{0,300}bytes\.byteLength/,
  'Local PDF size and digest must be derived from the same bytes that were validated'
);

const releaseOutput = await mkdtemp(path.join(tmpdir(), 'cannainsider-release-test-'));
try {
  const first = manifest.publications[0];
  const releaseCheck = spawnSync(
    process.execPath,
    ['tools/prepare-publication-release.mjs', first.id, String(first.version)],
    {
      encoding: 'utf8',
      env: { ...process.env, PUBLICATION_OUTPUT_ROOT: releaseOutput }
    }
  );
  assert.equal(releaseCheck.status, 0, releaseCheck.stderr || releaseCheck.stdout);
  const releaseRoot = releaseCheck.stdout.trim();
  assert.equal(path.dirname(releaseRoot), releaseOutput);
  assert.match(await readFile(path.join(releaseRoot, 'SHA256SUMS.txt'), 'utf8'), /^[a-f0-9]{64}/);
  assert.equal(
    JSON.parse(await readFile(path.join(releaseRoot, 'publication.json'), 'utf8')).publication.id,
    first.id
  );
} finally {
  await rm(releaseOutput, { recursive: true, force: true });
}

console.log(`Publication pipeline: ${manifest.publications.length} versioned reports and local source checks passed`);
