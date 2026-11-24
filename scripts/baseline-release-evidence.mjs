// Baseline evidence v1: binds all staged bytes to a successful sliced audit.
// NOT an authorization, signature or permission to reuse privacy decisions.
// Consume only with authenticated GitHub run/artifact metadata; local JSON
// alone cannot establish trust. Existing final audit remains mandatory.
import { createHash } from 'node:crypto';
import { open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inventory, treeDigest, verifyMirroredPdfs } from './plan-incremental-release.mjs';

const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const positive = /^[1-9][0-9]*$/;
const repo = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const workflow = '.github/workflows/trusted-pdf-shard-diagnostic.yml';
const digest = b => createHash('sha256').update(b).digest('hex');
function insist(ok, message) { if (!ok) throw Error(message); }

async function pdfCandidates(root, files) {
  const pdfs = new Map();
  for (const [rel,value] of files) {
    if (/\.pdf$/i.test(rel)) { pdfs.set(rel,value); continue; }
    const fd = await open(path.join(root,rel),'r');
    try {
      const buf=Buffer.alloc(1024);
      const {bytesRead}=await fd.read(buf,0,buf.length,0);
      if (buf.subarray(0,bytesRead).includes(Buffer.from('%PDF-'))) pdfs.set(rel,value);
    } finally { await fd.close(); }
  }
  return pdfs;
}

export async function createBaselineEvidence({root, reportPath, source, repository, runId, attempt}) {
  insist(sha.test(source||'') && repo.test(repository||'') &&
    positive.test(String(runId)) && positive.test(String(attempt)), 'Invalid expected run identity');
  const raw = await readFile(reportPath);
  const report = JSON.parse(raw);
  insist(report.schema_version === '1.1-sliced' && report.checkout_commit === source &&
    report.github_event_sha === source && report.expected_pr_head_commit === source &&
    report.base_is_ancestor === true, 'Audit source/lineage mismatch');
  insist(report.summary?.hard_failure_count === 0 && Array.isArray(report.summary.hard_failures) &&
    report.summary.hard_failures.length === 0 &&
    report.registry_web_stage_reconciliation?.staged_set_exact_match === true &&
    report.registry_web_stage_reconciliation?.id69_absent_from_final_release_state === true &&
    report.privacy_hardening?.hard_failure_count === 0 &&
    Array.isArray(report.privacy_hardening.hard_failures) && !report.privacy_hardening.hard_failures.length,
    'Audit not clean');
  const files=await inventory(root);
  verifyMirroredPdfs(files);
  for(const rel of ['.source-commit','web/.source-commit']) {
    insist(files.has(rel) && (await readFile(path.join(root,rel),'utf8')).trim() === source,'Stage source mismatch');
  }
  for(const rel of ['.nojekyll','web/.nojekyll']) insist(files.has(rel),'Missing stage marker');
  const pdfs=await pdfCandidates(root,files);
  insist(pdfs.size > 0 && Array.isArray(report.all_final_web_pdfs) &&
    report.summary.all_final_staged_pdf_count === pdfs.size &&
    report.all_final_web_pdfs.length === pdfs.size,'Audit PDF count mismatch');
  const seen=new Set();
  for(const row of report.all_final_web_pdfs) {
    insist(typeof row.published_path === 'string' && !seen.has(row.published_path) &&
      hash.test(row.sha256||'') && pdfs.get(row.published_path) === row.sha256 &&
      row.checks && Object.keys(row.checks).length > 0 && Object.values(row.checks).every(v=>v===true),
      'Audit PDF row mismatch or failed check');
    seen.add(row.published_path);
  }
  insist(treeDigest(await inventory(root)) === treeDigest(files),'Stage changed during evidence generation');
  return {schema:1,scope:'baseline-bytes-only',repository,workflow,run_id:String(runId),
    run_attempt:String(attempt),source_commit:source,report_sha256:digest(raw),
    tree_sha256:treeDigest(files),file_count:files.size,pdf_count:pdfs.size,
    authorization_granted:false,privacy_reuse_granted:false};
}

export async function verifyBaselineEvidence({manifest, run, expected, root, reportPath}) {
  insist(expected && sha.test(expected.source||'') && repo.test(expected.repository||'') &&
    positive.test(String(expected.runId)) && positive.test(String(expected.attempt)), 'Missing independently selected baseline identity');
  insist(String(run?.id)===String(expected.runId) && String(run?.run_attempt)===String(expected.attempt) &&
    run?.repository?.full_name===expected.repository && run?.head_repository?.full_name===expected.repository &&
    run?.head_sha===expected.source && run?.path===workflow && run?.head_branch==='main' &&
    run?.event==='push' && run?.status==='completed' && run?.conclusion==='success',
    'GitHub baseline run identity/status mismatch');
  const actual=await createBaselineEvidence({root,reportPath,source:expected.source,
    repository:expected.repository,runId:expected.runId,attempt:expected.attempt});
  insist(manifest && Object.keys(manifest).length===Object.keys(actual).length &&
    Object.entries(actual).every(([k,v])=>manifest[k]===v),'Baseline evidence mismatch');
  return actual;
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode,root,reportPath,out]=process.argv.slice(2);
  insist(mode==='--create' && root && reportPath && out && process.argv.length===6,'Usage: --create STAGE REPORT OUTPUT');
  insist(process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_EVENT_NAME==='push' &&
    process.env.GITHUB_REF==='refs/heads/main','Baseline generation requires trusted push context');
  const manifest=await createBaselineEvidence({root,reportPath,source:process.env.GITHUB_SHA,
    repository:process.env.GITHUB_REPOSITORY,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
  await writeFile(out,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  console.log('Baseline bytes bound to audit and exact run; no authorization granted.');
}
