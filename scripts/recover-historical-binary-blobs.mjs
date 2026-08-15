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

async function accept(data, source) {
  if (!Buffer.isBuffer(data) || data.length < 5 || data.subarray(0,5).toString() !== '%PDF-') return false;
  const h = sha256(data); const rel = expected.get(h); if (!rel) return false;
  await mkdir(path.dirname(path.join(root, rel)), {recursive:true});
  await writeFile(path.join(root, rel), data); found.add(rel);
  console.log(`HISTORY BLOB VERIFIED ${rel} ${h} source=${source}`); return true;
}

async function inspect(data, source) {
  if (await accept(data, source)) return;
  if (data.length >= 6 && data[0]===0xfd && data[1]===0x37 && data[2]===0x7a && data[3]===0x58 && data[4]===0x5a && data[5]===0x00) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'blob-recovery-')); const f=path.join(dir,'x.xz');
    try { await writeFile(f,data); const {stdout}=await execFileAsync('xz',['-dc',f],{encoding:null,maxBuffer:64*1024*1024}); if (await accept(stdout,`${source}:xz`)) return;
      const tar=path.join(dir,'x.tar'), out=path.join(dir,'out'); await writeFile(tar,stdout); await mkdir(out);
      try { await execFileAsync('tar',['-xf',tar,'-C',out],{maxBuffer:64*1024*1024}); const stack=[out]; while(stack.length){const d=stack.pop(); for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) stack.push(p); else if(/\.pdf$/i.test(e.name)) await accept(await readFile(p),`${source}:tar:${e.name}`);}} } catch {}
    } catch {} finally { await rm(dir,{recursive:true,force:true}); }
  }
}

const {stdout:list}=await execFileAsync('git',['rev-list','--objects','--all'],{encoding:'utf8',maxBuffer:64*1024*1024});
const candidates=new Map();
for(const line of list.split('\n')){const i=line.indexOf(' '); if(i<0) continue; const oid=line.slice(0,i), p=line.slice(i+1); if(/(?:\.b64|\.xz|\.pdf|binary|bundle|source)/i.test(p) && !candidates.has(oid)) candidates.set(oid,p);}
console.log(`HISTORY BLOB CANDIDATES ${candidates.size}`);
for(const [oid,p] of candidates){ if(found.size===expected.size) break; let data; try{({stdout:data}=await execFileAsync('git',['cat-file','blob',oid],{encoding:null,maxBuffer:32*1024*1024}));}catch{continue;} await inspect(data,`git:${p}@${oid}`);
  if(/\.b64$/i.test(p) || (/^[A-Za-z0-9+/=\r\n]+$/.test(data.toString('latin1')) && data.length<8*1024*1024)){ try{const s=data.toString('utf8').replace(/\s+/g,''); if(s.length>=8 && s.length%4!==1) await inspect(Buffer.from(s,'base64'),`git-b64:${p}@${oid}`);}catch{} }
}
console.log(`HISTORY BLOB RECOVERY ${found.size}/${expected.size}`);
