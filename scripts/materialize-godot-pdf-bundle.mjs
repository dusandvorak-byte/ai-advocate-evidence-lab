import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const outputRoot = 'web';
const expected = {
  'documents/report-04082026-010/25-mv-127234-2-obp-2026-2026-08-11.pdf': 'c65c9cc5f12eab03f69c4ea1bf642c3078f4858153b385e80f141da6ea334a55',
  'documents/report-04082026-010/26-gfaa-rozklad-mv-127234-2-obp-2026-2026-08-12.pdf': '769392aa996dda284c927b9bee9fbee1c364daade8d2a1867fe7fa380d4b3cc2',
  'documents/report-04082026-010/27-mk-49467-2026-socns-2026-08-12.pdf': 'bb23820c9a02a17a976f0a746def4c53f4afa413fb708259e25a59d6a2f0f3b1',
  'documents/report-04082026-010/28-dvorak-odvolani-nsz-sin-55-2026-19-2026-08-01.pdf': '021a9c83a3079ab0b6e26205c510e6d8b1633dfe3c30c57c3048538942fb91b3',
  'documents/report-04082026-010/29-dvorak-odvolani-msz-sin-48-2026-12-2026-07-31.pdf': '564fa5536735679523d976664eb805fa82987c7699134a15f483c530b4a40e02',
  'documents/report-04082026-010/30-dvorak-stiznost-msz-necinnost-infz-2026-07-31.pdf': '77e623a6b0af714d479ec8b8c4fda8ea3fef0d2330f0dc6fcf541258c73e9dec',
  'documents/report-04082026-010/31-policie-uvk-pp-ppr-43826-2-cj-2026-990210-pd-2026-08-14.pdf': '823d7ec58d9ed6de4abde4f0636eb1d87d9d16c331ac7d143c2342621999c88c',
  'documents/report-04082026-010/32-dvorak-stiznost-uvk-pp-pcr-2026-08-14.pdf': 'f74b439f6d99826a7f49b32e08e2f908017c4e840a2b8837dd241fbc582f765d',
  'documents/report-04082026-010/33-os-prostejov-15-nt-3103-2026-53-2026-08-07.pdf': 'd461ad6eacc569ba8d86c4ce640a3f6273ff67ae48fc5ea57f1f8653ce0e2a40'
};

const exists = async file => access(file, constants.F_OK).then(() => true).catch(() => false);
const hash = data => createHash('sha256').update(data).digest('hex');

async function verifyAndWrite(relative, data, source) {
  const wanted = expected[relative];
  if (!wanted) throw new Error(`Neznámý cíl ${relative}`);
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${relative}: ${source} nevytvořil PDF`);
  const actual = hash(data);
  if (actual !== wanted) throw new Error(`${relative}: SHA-256 ${actual} neodpovídá ${wanted} (${source})`);
  const target = path.join(outputRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  console.log(`PDF VERIFIED ${relative} ${actual} source=${source}`);
}

// 1) Znovupoužitelné zdroje po jednotlivých dokumentech. Nový zdroj se přidává sem,
// nikoli do jednoho monolitického archivu; chyba jednoho PDF tak neblokuje obnovu ostatních.
const directSources = [
  {
    relative: 'documents/report-04082026-010/25-mv-127234-2-obp-2026-2026-08-11.pdf',
    chunks: [
      'project-memory/recovery-sources/25-mv/000.b64',
      'project-memory/recovery-sources/25-mv/001.b64',
      'project-memory/recovery-sources/25-mv/002-005.b64',
      'project-memory/recovery-sources/25-mv/006-009.b64'
    ]
  }
];

for (const item of directSources) {
  if (!(await Promise.all(item.chunks.map(exists))).every(Boolean)) continue;
  let encoded = '';
  for (const chunk of item.chunks) encoded += (await readFile(chunk, 'utf8')).trim();
  await verifyAndWrite(item.relative, Buffer.from(encoded, 'base64'), `direct:${item.chunks.join(',')}`);
}

// 2) Již uložený komprimovaný zdroj stížnosti MSZ (PDF 30).
const mszSource = 'project-memory/binary-final/msz-necinnost.xz.b64';
if (await exists(mszSource)) {
  const xz = Buffer.from((await readFile(mszSource, 'utf8')).trim(), 'base64');
  const tmp = '/tmp/godot-msz-necinnost.pdf.xz';
  await writeFile(tmp, xz);
  const { stdout } = await execFileAsync('xz', ['-dc', tmp], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 });
  await rm(tmp, { force: true });
  await verifyAndWrite('documents/report-04082026-010/30-dvorak-stiznost-msz-necinnost-infz-2026-07-31.pdf', stdout, `xz:${mszSource}`);
}

// 3) Přechodová kompatibilita se starým 108dílným archivem. Použije se jen tehdy,
// je-li skutečně kompletní a potřebujeme z něj doplnit dosud chybějící PDF.
const chunksDir = 'project-memory/binary-bundle-2026-08-15';
if (await exists(chunksDir)) {
  const names = (await readdir(chunksDir)).filter(name => /^chunk-\d{3}\.b64$/.test(name)).sort();
  if (names.length === 108) {
    for (let i = 0; i < names.length; i++) {
      const expectedName = `chunk-${String(i).padStart(3, '0')}.b64`;
      if (names[i] !== expectedName) throw new Error(`Legacy balík není souvislý: očekáváno ${expectedName}, nalezeno ${names[i]}`);
    }
    let encoded = '';
    for (const name of names) encoded += (await readFile(`${chunksDir}/${name}`, 'utf8')).trim();
    const archive = Buffer.from(encoded, 'base64');
    const archiveHash = hash(archive);
    if (archiveHash !== 'f814095514a232208c150636028ef918d989cf4c04655e1b79abbe5e96a8b5a8') throw new Error(`SHA-256 legacy balíku nesedí: ${archiveHash}`);
    const archivePath = '/tmp/godot-pdfs-2026-08-15.tar.xz';
    await writeFile(archivePath, archive);
    await execFileAsync('tar', ['-xJf', archivePath, '-C', outputRoot], { maxBuffer: 20 * 1024 * 1024 });
    await rm(archivePath, { force: true });
  } else {
    console.log(`Legacy balík ignorován: ${names.length}/108 částí. Jednotlivé zdroje mají přednost.`);
  }
}

// Finální brána: nic se nesmí publikovat, dokud všech devět cest fyzicky neexistuje,
// nezačíná %PDF- a neodpovídá přesnému SHA-256.
const missing = [];
for (const [relative, wanted] of Object.entries(expected)) {
  const target = path.join(outputRoot, relative);
  if (!(await exists(target))) { missing.push(relative); continue; }
  const data = await readFile(target);
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${relative}: výsledný soubor není PDF`);
  const actual = hash(data);
  if (actual !== wanted) throw new Error(`${relative}: výsledný SHA-256 ${actual} neodpovídá ${wanted}`);
}
if (missing.length) throw new Error(`Chybí ověřené binární zdroje pro ${missing.length} PDF: ${missing.join(' | ')}`);
console.log(`Materializováno a SHA-256 ověřeno ${Object.keys(expected).length} PDF pro Godot.`);
