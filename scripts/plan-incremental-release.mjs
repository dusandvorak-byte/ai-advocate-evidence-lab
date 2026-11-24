#!/usr/bin/env node
// Read-only prototype: classify an already verified release against an existing release.
// Not a privacy/authorization gate, not a deploy tool, and not a source of trust.
import { createHash } from 'node:crypto';
import { readdir, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};

export async function inventory(root) {
  const result = new Map();
  if (!(await lstat(root)).isDirectory()) throw new Error('Root must be a directory');
  async function visit(dir, prefix = '') {
    for (const name of (await readdir(dir)).sort()) {
      if (/[\x00-\x1f\\]/.test(name)) throw new Error('Unsafe filename');
      const rel = prefix + name;
      const file = path.join(dir, name);
      const stat = await lstat(file);
      if (stat.isDirectory()) await visit(file, rel + '/');
      else if (stat.isFile()) result.set(rel, await digest(file));
      else throw new Error('Non-regular release entry: ' + rel);
    }
  }
  await visit(root);
  return result;
}

// Hash a canonical list of paths and digests, not mtimes or traversal order.
export function treeDigest(files) {
  const entries = [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

const isPdf = name => /\.pdf$/i.test(name);
export function verifyMirroredPdfs(files) {
  for (const [name, sha] of files) {
    if (!isPdf(name)) continue;
    const mirror = name.startsWith('web/') ? name.slice(4) : 'web/' + name;
    if (files.get(mirror) !== sha) throw new Error('PDF mirror mismatch: ' + name);
  }
}

export async function planIncrementalRelease(baseline, candidate) {
  const [oldFiles, newFiles] = await Promise.all([inventory(baseline), inventory(candidate)]);
  verifyMirroredPdfs(oldFiles);
  verifyMirroredPdfs(newFiles);
  const added = [], changed = [], removed = [];
  for (const [name, sha256] of newFiles) {
    if (!oldFiles.has(name)) added.push({ path: name, sha256 });
    else if (oldFiles.get(name) !== sha256) changed.push({ path: name, sha256, previous_sha256: oldFiles.get(name) });
  }
  for (const [name, sha256] of oldFiles) {
    if (!newFiles.has(name)) removed.push({ path: name, sha256 });
  }
  const historicalPdfChanged = [...changed, ...removed].filter(item => isPdf(item.path));
  return {
    schema: 2,
    baseline_tree_sha256: treeDigest(oldFiles),
    candidate_tree_sha256: treeDigest(newFiles),
    advisory_only: true,
    mode: historicalPdfChanged.length || removed.length ? 'full-required' : 'append-only-candidate',
    baseline_files: oldFiles.size,
    candidate_files: newFiles.size,
    unchanged_files: oldFiles.size - changed.length - removed.length,
    added, changed, removed, historical_pdf_changed: historicalPdfChanged,
    note: 'Candidate still requires trusted audit, exact SHA authorization, all final web contracts and production verification. No files are written.'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error('Usage: node scripts/plan-incremental-release.mjs BASELINE CANDIDATE');
  const result = await planIncrementalRelease(process.argv[2], process.argv[3]);
  console.log(JSON.stringify(result, null, 2));
}
