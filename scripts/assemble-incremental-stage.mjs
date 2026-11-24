#!/usr/bin/env node
// Shadow-mode stage assembly. Never publishes or grants authorization.
// Expected digests MUST be supplied from independently verified evidence in a
// future trusted integration. A caller-supplied digest is not authentication.
import { copyFile, lstat, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inventory, treeDigest, verifyMirroredPdfs } from './plan-incremental-release.mjs';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function validPath(value) {
  return typeof value === 'string' && value.length > 0 &&
    !/[\x00-\x1f\\]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..' && part !== '.git');
}
function inside(a, b) { return a === b || a.startsWith(b + path.sep); }

export async function assembleIncrementalStage({ baseline, overlay, output, plan, expectedBaseline, expectedCandidate }) {
  if (!hex(expectedBaseline) || !hex(expectedCandidate)) throw Error('Both independently verified tree digests required');
  if (plan?.schema !== 2 || plan.advisory_only !== true || plan.mode !== 'append-only-candidate' ||
      plan.baseline_tree_sha256 !== expectedBaseline || plan.candidate_tree_sha256 !== expectedCandidate ||
      !Array.isArray(plan.added) || !Array.isArray(plan.changed) ||
      !Array.isArray(plan.removed) || plan.removed.length ||
      !Array.isArray(plan.historical_pdf_changed) || plan.historical_pdf_changed.length) throw Error('Unsupported or unbound append-only plan');
  for (const root of [baseline, overlay]) {
    if (!(await lstat(root)).isDirectory()) throw Error('Input must be a real directory');
  }
  const baseRoot = await realpath(baseline), overlayRoot = await realpath(overlay);
  const outRoot = path.join(await realpath(path.dirname(path.resolve(output))), path.basename(path.resolve(output)));
  const roots = [baseRoot, overlayRoot, outRoot];
  for (let i=0;i<roots.length;i++) for (let j=i+1;j<roots.length;j++)
    if (inside(roots[i],roots[j]) || inside(roots[j],roots[i])) throw Error('Stage and inputs must be disjoint');
  const oldFiles = await inventory(baseRoot);
  verifyMirroredPdfs(oldFiles);
  if (treeDigest(oldFiles) !== expectedBaseline) throw Error('Baseline digest mismatch');
  const newFiles = new Map(oldFiles);
  const expectedOverlay = new Map();
  for (const [kind, rows] of [['add',plan.added],['change',plan.changed]]) {
    for (const row of rows) {
      if (!row || !validPath(row.path) || !hex(row.sha256) || expectedOverlay.has(row.path))
        throw Error('Unsafe or duplicate delta path');
      if (kind === 'add' && oldFiles.has(row.path)) throw Error('Addition already exists');
      if (kind === 'change' && (!oldFiles.has(row.path) ||
          row.previous_sha256 !== oldFiles.get(row.path) || row.sha256 === row.previous_sha256 ||
          /\.pdf$/i.test(row.path))) throw Error('Historical PDF change or invalid previous digest');
      newFiles.set(row.path,row.sha256);
      expectedOverlay.set(row.path,row.sha256);
    }
  }
  verifyMirroredPdfs(newFiles);
  if (treeDigest(newFiles) !== expectedCandidate) throw Error('Candidate manifest digest mismatch');
  if (treeDigest(await inventory(overlayRoot)) !== treeDigest(expectedOverlay)) throw Error('Overlay inventory mismatch');
  // No production path or Git mutation. Exclusive mkdir protects existing output.
  await mkdir(outRoot);
  try {
    for (const rel of oldFiles.keys()) {
      if (!validPath(rel)) throw Error('Unsafe baseline path');
      const target = path.join(outRoot,rel);
      await mkdir(path.dirname(target),{recursive:true});
      await copyFile(path.join(baseRoot,rel),target,constants.COPYFILE_EXCL);
    }
    for (const rel of expectedOverlay.keys()) {
      const target = path.join(outRoot,rel);
      await mkdir(path.dirname(target),{recursive:true});
      await copyFile(path.join(overlayRoot,rel),target);
    }
    const actual = await inventory(outRoot);
    verifyMirroredPdfs(actual);
    if (treeDigest(actual) !== expectedCandidate) throw Error('Assembled tree digest mismatch');
    return { mode:'shadow-only', tree_sha256:expectedCandidate, reused:oldFiles.size-plan.changed.length, overlaid:expectedOverlay.size };
  } catch (error) {
    await rm(outRoot,{recursive:true,force:true});
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 8) throw Error('Usage: node scripts/assemble-incremental-stage.mjs BASELINE OVERLAY OUTPUT PLAN EXPECTED_BASE_SHA256 EXPECTED_CANDIDATE_SHA256');
  const [baseline,overlay,output,planPath,expectedBaseline,expectedCandidate] = process.argv.slice(2);
  const plan = JSON.parse(await readFile(planPath,'utf8'));
  console.log(JSON.stringify(await assembleIncrementalStage({baseline,overlay,output,plan,expectedBaseline,expectedCandidate}),null,2));
}
