import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const root = 'web';
const registryPaths = [
  'project-memory/documents-2026-supplement-2026-08-19-20.json',
  'project-memory/documents-2026-supplement-2026-08-20-24.json',
  'project-memory/documents-2026-supplement-2026-08-24-corrections.json'
];

const expected = new Map([
  ['17130030d4061c9ca234a712f2bf54eb3e5587caa169549fb49db045117cf95d', { id:'doc-cz-dd-2026-08-20-replika-8-ad-9-2026', rel:'documents/report-04082026-010/62-dvorak-replika-8-ad-9-2026-2026-08-20.pdf' }],
  ['585890aa232decf5c4f36bdeab5828c13906f7fb1ce9ea9177729f0c1fcb764e', { id:'doc-cz-dd-2026-08-19-doplneni-18-a-23-2026', rel:'documents/report-04082026-010/63-dvorak-ms-praha-18-a-23-2026-doplneni-2026-08-19.pdf' }],
  ['3adb7ecb7b52c0cd5ce09c939b6731dcfa6a59902c721c8927ca5a2be1a284dd', { id:'doc-cz-dd-2026-08-21-mv-druhe-nalehave-doplneni-stiznosti', rel:'documents/report-04082026-010/72-dvorak-mv-druhe-nalehave-doplneni-stiznosti-2026-08-24.pdf' }],
  ['e5aff93e13d15bbb2b50bd060870d66f8bdabe99f537e75f9483720c9aaec18b', { id:'doc-cz-dd-2026-08-21-ms-praha-15-a-44-2026-doplneni', rel:'documents/report-04082026-010/73-dvorak-ms-praha-15-a-44-2026-doplneni-2026-08-24.pdf' }],
  ['947d16d544aeaca69048927951530edcdd802fdaae3e6c70b42201c05d56d2d1', { id:'doc-cz-dd-2026-08-22-os-prostejov-2-t-104-2010-dodatek', rel:'documents/report-04082026-010/74-dvorak-os-prostejov-2-t-104-2010-dodatek-2026-08-22.pdf' }],
  ['e0a9eb8f035799235333df5e6ba7c1633e035473ca5904c84b11114a3dad8550', { id:'doc-cz-dd-2026-08-22-nsz-sedme-doplneni-karny-podnet', rel:'documents/report-04082026-010/75-dvorak-nsz-sedme-doplneni-karny-podnet-2026-08-22.pdf' }],
  ['625e399e3e0921618d5672dec82df2646ffa465955d57a3ae888ce349718343d', { id:'doc-cz-dd-2026-08-24-vsz-praha-prezkum-msz-2-kzn-55-2025-136', rel:'documents/report-04082026-010/76-dvorak-vsz-praha-prezkum-msz-2026-08-24.pdf' }],
  ['9cf3f4cd1fa5d9f6293689ecc61c318921f1f10351776957d9e95ad9a458858b', { id:'doc-cz-dd-2026-08-24-policejni-prezident-doplneni-prezkumu', rel:'documents/report-04082026-010/77-dvorak-policejni-prezident-doplneni-prezkumu-2026-08-24.pdf' }],
  ['9b42d955d5444d0ff09cf81f761796d81cff2e05507c07ea27270bdca5ef8179', { id:'doc-cz-dd-2026-08-24-gibs-doplneni-trestniho-oznameni', rel:'documents/report-04082026-010/78-dvorak-gibs-doplneni-trestniho-oznameni-2026-08-24.pdf' }],
  ['afd8f005d4effc9bacc5285173795775b2ad8fed181ab1a06ac1e4ddf256b4a7', { id:'doc-cz-dd-2026-08-24-mv-odvolani-krpt-203594-8', rel:'documents/report-04082026-010/79-dvorak-mv-odvolani-krpt-203594-8-2026-08-24.pdf' }],
  ['3dd9fcf7fcb5d4a83fc0ed4dbe2c5e2a191d4522cc1e8ee20462dc299dc4de90', { id:'doc-cz-dd-2026-08-24-vsz-olomouc-dohled-okte', rel:'documents/report-04082026-010/80-vsz-olomouc-dohled-okte-2026-08-24.pdf' }],
  ['99ad5adaa674d91489cae44380fbbef1fcc2f55db39ac6797ce99cbb65ac2a43', { id:'doc-cz-ekk-dd-gf-2026-08-24-ostrava-frydek-brno-doplneni', rel:'documents/report-04082026-010/81-ekk-druhy-dodatek-okte-2026-08-24.pdf' }],
  ['e53b94ad9a6eea956695b41e3ed7bfacbd7477cf004d12b6eeb23a6ba1c5c705', { id:'doc-cz-dd-2026-08-22-ks-brno-9-to-315-316-doplneni', rel:'documents/report-04082026-010/82-dvorak-ks-brno-9-to-315-316-doplneni-2026-08-22.pdf' }]
]);

const sha256 = b => createHash('sha256').update(b).digest('hex');
const found = new Map();
const { stdout:list } = await execFileAsync('git',['rev-list','--objects','--all'],{encoding:'utf8',maxBuffer:96*1024*1024});
const candidates = [];
for (const line of list.split('\n')) {
  const i=line.indexOf(' '); if(i<0) continue;
  const oid=line.slice(0,i), p=line.slice(i+1);
  if (/\.pdf$/i.test(p)) candidates.push({oid,p});
}
console.log(`REACTION PDF HISTORY CANDIDATES ${candidates.length}`);
for (const {oid,p} of candidates) {
  if (found.size===expected.size) break;
  let data;
  try { ({stdout:data}=await execFileAsync('git',['cat-file','blob',oid],{encoding:null,maxBuffer:64*1024*1024})); } catch { continue; }
  if (data.length<5 || data.subarray(0,5).toString()!=='%PDF-') continue;
  const h=sha256(data), item=expected.get(h);
  if (!item || found.has(item.id)) continue;
  const target=path.join(root,item.rel);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,data);
  found.set(item.id,{...item,sha256:h,source:`git:${p}@${oid}`});
  console.log(`REACTION PDF VERIFIED ${item.id} ${item.rel} ${h} source=${p}@${oid}`);
}

for (const regPath of registryPaths) {
  const reg=JSON.parse(await readFile(regPath,'utf8'));
  let changed=0;
  for (const doc of reg.documents||[]) {
    const item=found.get(doc.id);
    if (!item) continue;
    doc.public ||= {};
    doc.public.pdf=item.rel;
    doc.public.sha256=item.sha256;
    doc.public.verification_status='git_history_original_pdf_verified';
    changed++;
  }
  if (changed) {
    await writeFile(regPath,JSON.stringify(reg,null,2)+'\n');
    console.log(`REACTION REGISTRY PATCH ${regPath} ${changed}`);
  }
}

const missing=[...expected.values()].filter(x=>!found.has(x.id));
console.log(`REACTION PDF RECOVERY ${found.size}/${expected.size}`);
if (missing.length) throw new Error(`Missing reaction PDFs in git history: ${missing.map(x=>x.id).join(', ')}`);
