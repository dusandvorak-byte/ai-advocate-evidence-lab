// Experimental surface refresh guard. This is not trusted release evidence.
// Only a disposable, non-Git workspace with already prepared inputs is eligible.
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { inventory, treeDigest } from './plan-incremental-release.mjs';

const roots = ['web','project-memory','scripts'];
const hex = /^[a-f0-9]{64}$/;
async function exists(file) {
  try { await lstat(file); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
function pdfInventory(files) {
  return new Map([...files].filter(([name]) => /\.pdf$/i.test(name)));
}
export async function captureShadowInputs(root) {
  const dir = await realpath(root);
  for (let p=dir;;p=path.dirname(p)) {
    if (await exists(path.join(p,'.git'))) throw Error('Shadow refresh requires a disposable workspace outside any Git checkout');
    if (path.dirname(p) === p) break;
  }
  const [web,memory,scripts] = await Promise.all(roots.map(name=>inventory(path.join(dir,name))));
  const registry = memory.get('documents-2026.json');
  if (!registry || !memory.has('privacy-hardening-report.json') || !memory.has('pdf-reconciliation-report.json') ||
      !web.has('data/pdf-reconciliation-report.json') || !pdfInventory(web).size) throw Error('Prepared surface inputs incomplete');
  const inputSha = createHash('sha256').update(JSON.stringify([treeDigest(web),treeDigest(memory),treeDigest(scripts)])).digest('hex');
  return {inputSha,pdfSha:treeDigest(pdfInventory(web)),registry};
}
export async function requireShadowInputs(root,expected) {
  if (typeof expected !== 'string' || !hex.test(expected)) throw Error('Exact prepared input digest required');
  const snapshot = await captureShadowInputs(root);
  if (snapshot.inputSha !== expected) throw Error('Prepared surface input digest mismatch');
  return snapshot;
}
export async function verifyShadowOutputs(root,before) {
  const web = await inventory(path.join(root,'web'));
  const memory = await inventory(path.join(root,'project-memory'));
  if (treeDigest(pdfInventory(web)) !== before.pdfSha) throw Error('Shadow surface generator modified PDF inventory');
  if (memory.get('documents-2026.json') !== before.registry) throw Error('Shadow surface generator modified canonical registry');
  if (web.get('data/documents-2026.json') !== before.registry) throw Error('Published registry mismatch');
  return {mode:'shadow-only',pdf_sha256:before.pdfSha,web_tree_sha256:treeDigest(web)};
}
