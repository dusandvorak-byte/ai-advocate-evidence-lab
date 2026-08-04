import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repositoryRoot, 'web');
const reportId = process.env.PUBLICATION_ID || process.argv[2];
const requestedVersion = Number(process.env.PUBLICATION_VERSION || process.argv[3]);
const outputRoot = path.resolve(process.env.PUBLICATION_OUTPUT_ROOT || path.join(repositoryRoot, 'dist'));

if (!/^\d{8}-\d{3}$/.test(reportId || '')) throw new Error('Invalid publication ID');
if (!Number.isInteger(requestedVersion) || requestedVersion < 1) throw new Error('Invalid publication version');
if (outputRoot === repositoryRoot || outputRoot === webRoot || outputRoot === path.parse(outputRoot).root) {
  throw new Error('Unsafe release output directory');
}

const manifest = JSON.parse(await readFile(path.join(webRoot, 'publication-manifest.json'), 'utf8'));
const publication = manifest.publications.find(item => item.id === reportId);
if (!publication) throw new Error(`Unknown publication: ${reportId}`);
if (publication.version !== requestedVersion) {
  throw new Error(`Manifest contains ${reportId} v${publication.version}, not v${requestedVersion}`);
}

const releaseName = `publication-${reportId}-v${requestedVersion}`;
const releaseRoot = path.join(outputRoot, releaseName);
await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });

const checksumRows = [];
async function copyVerified(relativePath, expectedHash) {
  const source = path.resolve(webRoot, relativePath);
  const relativeCheck = path.relative(webRoot, source);
  if (relativeCheck.startsWith('../') || path.isAbsolute(relativeCheck)) {
    throw new Error(`Release path escapes web/: ${relativePath}`);
  }
  const bytes = await readFile(source);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) throw new Error(`Hash mismatch: ${relativePath}`);
  const target = path.join(releaseRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  checksumRows.push(`${actualHash}  ${relativePath}`);
}

await copyVerified(publication.article, publication.articleSha256);
for (const source of publication.sources) {
  if (source.path) await copyVerified(source.path, source.sha256);
}

const releaseMetadata = {
  schema: manifest.schema,
  schemaVersion: manifest.schemaVersion,
  release: releaseName,
  publication
};
await writeFile(
  path.join(releaseRoot, 'publication.json'),
  `${JSON.stringify(releaseMetadata, null, 2)}\n`,
  'utf8'
);
await writeFile(
  path.join(releaseRoot, 'SHA256SUMS.txt'),
  `${checksumRows.sort().join('\n')}\n`,
  'utf8'
);
await writeFile(
  path.join(releaseRoot, 'RELEASE-NOTES.md'),
  [
    `# CannaInsider ${reportId} — version ${requestedVersion}`,
    '',
    `Immutable evidence publication for report ${reportId}.`,
    '',
    '- The archive contains the reviewed article, locally hosted source records linked by that article, publication metadata and SHA-256 checksums.',
    '- A source record documents what it says; publication does not convert allegations, referrals or procedural steps into proof of wrongdoing.',
    '- Later corrections require a new manifest version and a new release.'
  ].join('\n'),
  'utf8'
);

console.log(releaseRoot);
