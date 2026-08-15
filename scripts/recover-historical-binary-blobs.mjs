import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const root = 'web';
const expected = new Map([
  ['c65c9cc5f12eab03f69c4ea1bf642c3078f4858153b385e80f141da6ea334a55','documents/report-04082026-010/25-mv-127234-2-obp-2026-2026-08-11.pdf'],
  ['769392aa996dda284c927b9bee9fbee1c364daade8d2a1867fe7fa380d4b3cc2','documents/report-04082026-010/26-gfaa-rozklad-mv-127234-2-obp-2026-2026-08-12.pdf'],
  ['bb23820c9a02a17a976f0a746def4c53f4afa413fb708259e25a59d6a2f0f3b1','documents/report-04082026-010/27-mk-49467-2026-socns-2026-08-12.pdf'],
  ['021a9c83a3079ab0b6e26205c510e6d8b1633dfe3c30c57c3048538942fb91b3','documents/report-04082026-010/28-dvorak-odvolani-nsz-sin-55-2026-19-2026-08-01.pdf'],
  ['564fa5536735679523d976664eb805fa82987c7699134a15f483c530b4a40e02','documents/report-04082026-010/29-dvorak-odvolani-msz-sin-48-2026-12-2026-07-31.pdf'],
  ['77e623a6b0af714d479ec8b8c4fda8ea3fef0d2330f0dc6fcf541258c73e9dec','documents/report-04082026-010/30-dvorak-stiznost-msz-necinnost-infz-2026-07-31.pdf'],
  ['823d7ec58d9ed6de4abde4f0636eb1d87d9d16c331ac7d143c2342621999c88c','documents/report-04082026-010/31-policie-uvk-pp-ppr-43826-2-cj-2026-990210-pd-2026-08-14.pdf'],
  ['f74b439f6d99826a7f49b32e08e2f908017c4e840a2b8837dd241fbc582f765d','documents/report-04082026-010/32-dvorak-stiznost-uvk-pp-pcr-2026-08-14.pdf'],
  ['d461ad6eacc569ba8d86c4ce640a3f6273ff67ae48fc5ea57f1f8653ce0e2a40','documents/report-04082026-010/33-os-prostejov-15-nt-3103-2026-53-2026-08-07.pdf']
]);
const sha256 = b => createHash('sha256').update(b).digest('hex');
const found = new Set();
const blobCache = new Map();

async function blob(oid) {
  if (blobCache.has(oid)) return blobCache.get(oid);
  const {stdout} = await execFileAsync('git',['cat-file','blob',oid],{encoding:null,maxBuffer:32*1024*1024});
  blobCache.set(oid, stdout); return stdout;
}

async function accept(data, source) {
  if (!Buffer.isBuffer(data) || data.length < 5 || data.subarray(0,5).toString() !== '%PDF-') return false;
  const h = sha256(data), rel = expected.get(h); if (!rel) return false;
  await mkdir(path.dirname(path.join(root, rel)), {recursive:true});
  await writeFile(path.join(root, rel), data); found.add(rel);
  console.log(`HISTORY BLOB VERIFIED ${rel} ${h} source=${source}`); return true;
}

async function inspect(data, source) {
  if (await accept(data, source)) return true;
  if (!(data.length >= 6 && data[0]===0xfd && data[1]===0x37 && data[2]===0x7a && data[3]===0x58 && data[4]===0x5a && data[5]===0x00)) return false;
  const dir=await mkdtemp(path.join(os.tmpdir(),'blob-recovery-')), f=path.join(dir,'x.xz');
  try {
    await writeFile(f,data);
    const {stdout}=await execFileAsync('xz',['-dc',f],{encoding:null,maxBuffer:64*1024*1024});
    if (await accept(stdout,`${source}:xz`)) return true;
    const tar=path.join(dir,'x.tar'), out=path.join(dir,'out'); await writeFile(tar,stdout); await mkdir(out);
    try {
      await execFileAsync('tar',['-xf',tar,'-C',out],{maxBuffer:64*1024*1024});
      const stack=[out];
      while(stack.length){const d=stack.pop(); for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) stack.push(p); else if(/\.pdf$/i.test(e.name)) await accept(await readFile(p),`${source}:tar:${path.relative(out,p)}`);}}
    } catch {}
  } catch {} finally { await rm(dir,{recursive:true,force:true}); }
  return false;
}

const {stdout:list}=await execFileAsync('git',['rev-list','--objects','--all'],{encoding:'utf8',maxBuffer:64*1024*1024});
const candidates=new Map();
for(const line of list.split('\n')){const i=line.indexOf(' '); if(i<0) continue; const oid=line.slice(0,i), p=line.slice(i+1); if(/(?:\.b64|\.xz|\.pdf|binary|bundle|source)/i.test(p) && !candidates.has(oid)) candidates.set(oid,p);}
console.log(`HISTORY BLOB CANDIDATES ${candidates.size}`);
for(const [oid,p] of candidates){ if(found.size===expected.size) break; let data; try{data=await blob(oid);}catch{continue;} await inspect(data,`git:${p}@${oid}`);
  if(/\.b64$/i.test(p) || (/^[A-Za-z0-9+/=\r\n]+$/.test(data.toString('latin1')) && data.length<8*1024*1024)){ try{const s=data.toString('utf8').replace(/\s+/g,''); if(s.length>=8 && s.length%4!==1) await inspect(Buffer.from(s,'base64'),`git-b64:${p}@${oid}`);}catch{} }
}

// Union solver: historické uploady někdy zanechaly různé části téhož PDF v různých
// commitech/branchích. Sestavíme proto všechny dosažitelné verze částí podle adresáře a
// číselného rozsahu názvu (např. 002.b64, 002-005.b64, chunk-019.b64) a zkusíme pouze
// kombinace, které beze zbytku dlaždicují souvislou řadu od nuly. Přijmeme výhradně
// výsledek, jehož dekódované PDF má jeden z devíti kanonických SHA-256.
async function recoverScatteredBase64Parts() {
  let commitsText;
  try { ({stdout:commitsText}=await execFileAsync('git',['log','--all','--format=%H','--','*.b64'],{encoding:'utf8',maxBuffer:16*1024*1024})); }
  catch (e) { console.log(`SCATTERED B64 SKIPPED ${e.message}`); return; }
  const commits=[...new Set(commitsText.trim().split(/\s+/).filter(Boolean))];
  const dirs=new Map();
  for(const commit of commits){
    let tree; try{({stdout:tree}=await execFileAsync('git',['ls-tree','-r',commit,'--','project-memory'],{encoding:'utf8',maxBuffer:32*1024*1024}));}catch{continue;}
    for(const line of tree.split('\n')){
      const m=line.match(/^\d+\s+blob\s+([0-9a-f]{40})\t(.+\.b64)$/i); if(!m) continue;
      const oid=m[1], p=m[2], base=path.posix.basename(p);
      const rm=base.match(/^(?:chunk-)?(\d{1,3})(?:-(\d{1,3}))?\.b64$/i); if(!rm) continue;
      const start=Number(rm[1]), end=rm[2]?Number(rm[2]):start; if(end<start || end-start>50) continue;
      const dir=path.posix.dirname(p); if(!dirs.has(dir)) dirs.set(dir,new Map());
      const key=`${start}-${end}`; if(!dirs.get(dir).has(key)) dirs.get(dir).set(key,new Map());
      dirs.get(dir).get(key).set(oid,{oid,start,end,base,p});
    }
  }
  console.log(`SCATTERED B64 GROUPS ${dirs.size}`);
  let attempts=0;
  for(const [dir,ranges] of dirs){
    if(found.size===expected.size) break;
    const pieces=[...ranges.values()].flatMap(v=>[...v.values()]);
    if(!pieces.some(p=>p.start===0) || pieces.length>80) continue;
    const byStart=new Map(); for(const p of pieces){if(!byStart.has(p.start))byStart.set(p.start,[]); byStart.get(p.start).push(p);}
    // DFS přes dlaždice; končíme při každém dosažitelném konci, protože neznáme počet částí.
    const chosen=[];
    async function dfs(next){
      if(attempts>4000 || found.size===expected.size) return;
      if(chosen.length){
        attempts++;
        try{
          let enc=''; for(const p of chosen) enc+=(await blob(p.oid)).toString('utf8').replace(/\s+/g,'');
          if(enc.length>=8 && enc.length%4!==1) await inspect(Buffer.from(enc,'base64'),`scattered:${dir}:${chosen.map(p=>p.base+'@'+p.oid.slice(0,7)).join('+')}`);
        }catch{}
      }
      const opts=byStart.get(next)||[];
      // nejdřív delší sloučené díly, potom jednotlivé verze
      opts.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
      for(const p of opts){chosen.push(p); await dfs(p.end+1); chosen.pop(); if(attempts>4000) return;}
    }
    await dfs(0);
  }
  console.log(`SCATTERED B64 COMPLETE attempts=${attempts} found=${found.size}/${expected.size}`);
}
await recoverScatteredBase64Parts();

console.log(`HISTORY BLOB RECOVERY ${found.size}/${expected.size}`);
