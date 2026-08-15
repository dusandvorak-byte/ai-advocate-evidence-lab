import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const chunksDir = 'project-memory/binary-bundle-2026-08-15';
const archivePath = '/tmp/godot-pdfs-2026-08-15.tar.xz';
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
const run = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} skončil kódem ${code}`)));
});
const names = (await readdir(chunksDir)).filter(name => /^chunk-\d{3}\.b64$/.test(name)).sort();
if (names.length !== 102) throw new Error(`Binární balík má ${names.length} částí; očekáváno 102.`);
let encoded = '';
for (const name of names) encoded += (await readFile(`${chunksDir}/${name}`, 'utf8')).trim();
const archive = Buffer.from(encoded, 'base64');
const archiveHash = createHash('sha256').update(archive).digest('hex');
if (archiveHash !== 'ac42184e6e4825ee1b4bfb115a73d0095219cebcaf46259d8824a658d7df0c60') throw new Error(`SHA-256 binárního balíku nesedí: ${archiveHash}`);
await writeFile(archivePath, archive);
await mkdir(`${outputRoot}/documents/report-04082026-010`, { recursive: true });
await run('tar', ['-xJf', archivePath, '-C', outputRoot]);
await rm(archivePath, { force: true });
for (const [relative, sha] of Object.entries(expected)) {
  const data = await readFile(`${outputRoot}/${relative}`);
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${relative} není PDF`);
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== sha) throw new Error(`SHA-256 ${relative} nesedí: ${actual}`);
}
console.log(`Materializováno a SHA-256 ověřeno ${Object.keys(expected).length} PDF pro Godot.`);
