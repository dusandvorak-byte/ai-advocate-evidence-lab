// Compare stage assembly only, not total publication or PDF regeneration.
import { cp, copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { planIncrementalRelease, inventory, treeDigest } from './plan-incremental-release.mjs';
import { assembleIncrementalStage } from './assemble-incremental-stage.mjs';
import { createBaselineEvidence, verifyBaselineEvidence } from './baseline-release-evidence.mjs';

const [oldDir,newDir,repo,oldRunId,newRunId,oldSha,newSha]=process.argv.slice(2);
if(process.argv.length!==9) throw Error('Expected OLD_DIR NEW_DIR REPO OLD_RUN NEW_RUN OLD_SHA NEW_SHA');
async function load(dir,runId,source) {
  const run=JSON.parse(await readFile(path.join(dir,'run.json'),'utf8'));
  const root=path.join(dir,'tree','release-site');
  const reportPath=path.join(dir,'report','release-evidence-audit.json');
  const expected={source,repository:repo,runId,attempt:'1'};
  const manifest=await createBaselineEvidence({root,reportPath,...expected});
  await verifyBaselineEvidence({manifest,run,expected,root,reportPath});
  return {root,manifest};
}
const old=await load(oldDir,oldRunId,oldSha), next=await load(newDir,newRunId,newSha);
let start=performance.now();
const plan=await planIncrementalRelease(old.root,next.root);
const planMs=Math.round(performance.now()-start);
const metrics={scope:'verified artifact stage assembly only',oldRunId,newRunId,plan_ms:planMs,
  mode:plan.mode,baseline_files:plan.baseline_files,candidate_files:plan.candidate_files,
  unchanged:plan.unchanged_files,added:plan.added.length,changed:plan.changed.length,
  removed:plan.removed.length,historical_pdf_changed:plan.historical_pdf_changed.length};
if(plan.mode!=='append-only-candidate'){
  console.log(JSON.stringify({...metrics,result:'not eligible; retain full build'},null,2));
} else {
  const temp=await mkdtemp(path.join(tmpdir(),'evidence-bench-'));
  try {
    const overlay=path.join(temp,'overlay'), full=path.join(temp,'full'), output=path.join(temp,'incremental');
    await mkdir(overlay);
    start=performance.now();
    for(const row of [...plan.added,...plan.changed]){
      const target=path.join(overlay,row.path);
      await mkdir(path.dirname(target),{recursive:true});
      await copyFile(path.join(next.root,row.path),target);
    }
    metrics.overlay_extraction_ms=Math.round(performance.now()-start);
    start=performance.now();
    await cp(next.root,full,{recursive:true,force:false,errorOnExist:true});
    if(treeDigest(await inventory(full))!==next.manifest.tree_sha256)throw Error('Full copy mismatch');
    metrics.full_copy_and_verify_ms=Math.round(performance.now()-start);
    start=performance.now();
    await assembleIncrementalStage({baseline:old.root,overlay,output,plan,
      expectedBaseline:old.manifest.tree_sha256,expectedCandidate:next.manifest.tree_sha256});
    metrics.incremental_assembly_ms=Math.round(performance.now()-start);
    metrics.exact_tree_match=treeDigest(await inventory(output))===next.manifest.tree_sha256;
    if(!metrics.exact_tree_match)throw Error('Incremental mismatch');
    console.log(JSON.stringify({...metrics,result:'matched stage; no claim about generation or deployment'},null,2));
  }finally{await rm(temp,{recursive:true,force:true});}
}
