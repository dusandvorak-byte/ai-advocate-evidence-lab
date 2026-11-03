import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const workflowPath = join(root, '.github/workflows/publish-gh-pages-branch.yml');
const verifierPath = join(root, 'scripts/verify-live-pdf.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('verifier is copied outside tracked checkout before destructive orphan publication', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const copy = 'install -m 0600 scripts/verify-live-pdf.mjs /tmp/evidence-verify-live-pdf.mjs';
  const checkout = 'git checkout --orphan gh-pages-publish';
  const remove = 'git rm -rf .';
  const invocation = 'node /tmp/evidence-verify-live-pdf.mjs "$base/$pdf_rel" "$pdf_local" "$GITHUB_SHA" "" /tmp/live-police-1015.pdf';
  assert.ok(workflow.includes(copy), 'A verifier must be retained outside the worktree');
  assert.ok(workflow.indexOf(copy) < workflow.indexOf(checkout), 'Copy must precede orphan checkout');
  assert.ok(workflow.indexOf(checkout) < workflow.indexOf(remove), 'Original destructive publish ordering preserved');
  assert.ok(workflow.indexOf(remove) < workflow.indexOf(invocation), 'Execute retained copy after deletion');
  assert.ok(!workflow.includes('node scripts/verify-live-pdf.mjs "$base/$pdf_rel"'), 'No invocation of deleted original path');
});

test('retained verifier is checksum checked before invocation; PDF byte-identity remains strict', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const expected = 'test "$(sha256sum /tmp/evidence-verify-live-pdf.mjs | awk \'{print $1}\')" = "$(cat /tmp/evidence-verify-live-pdf.sha256)"';
  assert.ok(workflow.includes(expected), 'Retained verifier must match the hash of the original');
  assert.ok(workflow.includes('published_pdf_sha="$(git show "FETCH_HEAD:$pdf_rel" | sha256sum | cut -d\' \' -f1)"'), 'Published blob must retain strict SHA256 verification');
  assert.ok(workflow.includes('if [ "$published_pdf_sha" != "$expected_pdf_sha" ]; then'), 'On mismatching blob, fail closed');
  assert.ok(workflow.includes('node /tmp/evidence-verify-live-pdf.mjs'), 'Use retained verified script');
});

test('retained verifier can run from an empty checkout while source is unavailable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'evidence-publish-reproducer-'));
  try {
    const isolated = join(dir, 'retained-verifier.mjs');
    const emptyCheckout = join(dir, 'orphan-checkout');
    await copyFile(verifierPath, isolated);
    await mkdir(emptyCheckout);
    assert.equal(sha256(await readFile(isolated)), sha256(await readFile(verifierPath)));
    await stat(isolated);
    await assert.rejects(stat(join(emptyCheckout, 'scripts/verify-live-pdf.mjs')), { code: 'ENOENT' });
    const run = spawnSync(process.execPath, [isolated], { cwd: emptyCheckout, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 2, 'Verifier must execute and reject missing arguments, not crash with MODULE_NOT_FOUND');
    assert.match(run.stderr, /Usage: node verify-live-pdf\.mjs/);
    assert.doesNotMatch(run.stderr, /MODULE_NOT_FOUND/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
