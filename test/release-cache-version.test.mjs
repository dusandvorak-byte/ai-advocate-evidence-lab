import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {releaseVersion,versionHtml,versionDocketsJs,verifyHtml,verifyDocketsJs,checkReleaseCacheTree} from '../scripts/release-cache-version.mjs';

const sha='1234567890abcdef'.repeat(2)+'12345678',v=sha.slice(0,12);
const html='<script src="live-dockets.js" defer></script><script src="/ai-advocate-evidence-lab/news-feed.js?v=old" defer></script><link href="/ai-advocate-evidence-lab/justice-slalom.css"><a href="documents/example.pdf">PDF</a>';
const js="const cssHref = 'home-rollups.css'; const liveDocketsCssHref = 'live-dockets.css?v=old';";
test('same audited SHA versions and verifies real local asset references',()=>{
  const h=versionHtml(html,sha), j=versionDocketsJs(js,sha);
  assert.ok(h.includes('live-dockets.js?v='+v));
  assert.ok(h.includes('/ai-advocate-evidence-lab/news-feed.js?v='+v));
  assert.ok(h.includes('justice-slalom.css?v='+v));
  assert.ok(h.includes('href="documents/example.pdf"'));
  assert.equal(versionHtml(h,sha),h);
  assert.equal(versionDocketsJs(j,sha),j);
  verifyHtml(h,sha,{englishHome:true});
  verifyDocketsJs(j,sha);
  assert.throws(()=>verifyHtml(html,sha,{englishHome:true}),/wrong release cache reference/);
  assert.throws(()=>verifyHtml(h.replace(/<script src="\/ai-advocate-evidence-lab\/news-feed[^>]*><\/script>/,''),sha,{englishHome:true}),/Missing/);
  assert.throws(()=>verifyHtml(h+h,sha,{englishHome:true}),/duplicate/);
  assert.throws(()=>verifyDocketsJs(js,sha),/wrong-version/);
  assert.throws(()=>releaseVersion('1234'),/40hex/);
  assert.throws(()=>verifyHtml(h,'f'.repeat(40),{englishHome:true}),/wrong release/);
});
test('staging and promotion share strict root and mirror readback',async()=>{
  const root=await mkdtemp(join(tmpdir(),'release-cache-'));
  try{
    await mkdir(join(root,'web'));
    for(const base of [root,join(root,'web')]){
      await writeFile(join(base,'en.html'),html);
      await writeFile(join(base,'live-dockets.js'),js);
    }
    await assert.rejects(checkReleaseCacheTree(root,sha),/wrong release/);
    await checkReleaseCacheTree(root,sha,{write:true});
    await checkReleaseCacheTree(root,sha);
    const mirror=join(root,'web','en.html');
    await writeFile(mirror,(await readFile(mirror,'utf8')).replace('news-feed.js?v='+v,'news-feed.js?v=stale'));
    await assert.rejects(checkReleaseCacheTree(root,sha),/wrong release/);
  }finally{await rm(root,{recursive:true,force:true});}
});
