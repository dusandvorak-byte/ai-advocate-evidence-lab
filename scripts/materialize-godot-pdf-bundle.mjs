import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const sourcePath = 'project-memory/direct-pdf-bundle-2026-08-16/godot-pdfs.tar.xz.b64';
const archivePath = '/tmp/godot-pdfs-2026-08-16.tar.xz';
const archiveSha256 = '14f9bcc938403ed4b615a5a5879ec8e40b4bc7b6691114b0e6e035cdb91e6e31';
const outputRoot = 'web';

const expected = new Map([
  ['documents/report-04082026-010/25-mv-127234-2-obp-2026-2026-08-11.pdf', 'c65c9cc5f12eab03f69c4ea1bf642c3078f4858153b385e80f141da6ea334a55'],
  ['documents/report-04082026-010/26-gfaa-rozklad-mv-127234-2-obp-2026-2026-08-12.pdf', '769392aa996dda284c927b9bee9fbee1c364daade8d2a1867fe7fa380d4b3cc2'],
  ['documents/report-04082026-010/27-mk-49467-2026-socns-2026-08-12.pdf', 'bb23820c9a02a17a976f0a746def4c53f4afa413fb708259e25a59d6a2f0f3b1'],
  ['documents/report-04082026-010/28-dvorak-odvolani-nsz-sin-55-2026-19-2026-08-01.pdf', '021a9c83a3079ab0b6e26205c510e6d8b1633dfe3c30c57c3048538942fb91b3'],
  ['documents/report-04082026-010/29-dvorak-odvolani-msz-sin-48-2026-12-2026-07-31.pdf', '564fa5536735679523d976664eb805fa82987c7699134a15f483c530b4a40e02'],
  ['documents/report-04082026-010/30-dvorak-stiznost-msz-necinnost-infz-2026-07-31.pdf', '77e623a6b0af714d479ec8b8c4fda8ea3fef0d2330f0dc6fcf541258c73e9dec'],
  ['documents/report-04082026-010/31-policie-uvk-pp-ppr-43826-2-cj-2026-990210-pd-2026-08-14.pdf', '823d7ec58d9ed6de4abde4f0636eb1d87d9d16c331ac7d143c2342621999c88c'],
  ['documents/report-04082026-010/32-dvorak-stiznost-uvk-pp-pcr-2026-08-14.pdf', 'f74b439f6d99826a7f49b32e08e2f908017c4e840a2b8837dd241fbc582f765d'],
  ['documents/report-04082026-010/33-os-prostejov-15-nt-3103-2026-53-2026-08-07.pdf', 'd461ad6eacc569ba8d86c4ce640a3f6273ff67ae48fc5ea57f1f8653ce0e2a40']
]);

const historicalBlobs = new Map([
  ['documents/report-04082026-010/28-dvorak-odvolani-nsz-sin-55-2026-19-2026-08-01.pdf', '158c83a6606f2216f60c93d03473ddc3628a5781'],
  ['documents/report-04082026-010/29-dvorak-odvolani-msz-sin-48-2026-12-2026-07-31.pdf', '6390ad22a54d50eca0794b913a7a22f975fcbc0c']
]);

const sha256 = data => createHash('sha256').update(data).digest('hex');
const pdfHeader = Buffer.from('%PDF-');

const encoded = (await readFile(sourcePath, 'utf8')).replace(/\s+/g, '');
if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
  throw new Error(`${sourcePath}: neplatný base64 zdroj`);
}
const archive = Buffer.from(encoded, 'base64');
const actualArchiveHash = sha256(archive);
if (actualArchiveHash !== archiveSha256) {
  throw new Error(`SHA-256 PDF archivu nesedí: ${actualArchiveHash}; očekáváno ${archiveSha256}`);
}
await writeFile(archivePath, archive);
await mkdir(`${outputRoot}/documents/report-04082026-010`, { recursive: true });
await execFileAsync('tar', ['-xJf', archivePath, '-C', outputRoot], { maxBuffer: 64 * 1024 * 1024 });
await rm(archivePath, { force: true });

for (const [relative, oid] of historicalBlobs) {
  const { stdout } = await execFileAsync('git', ['cat-file', 'blob', oid], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024
  });
  const target = path.join(outputRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, stdout);
}

for (const [relative, expectedHash] of expected) {
  const file = path.join(outputRoot, relative);
  const data = await readFile(file);
  if (data.length < 1024 || !data.subarray(0, 5).equals(pdfHeader)) {
    throw new Error(`${relative}: materializovaný soubor není skutečné PDF`);
  }
  if (!data.subarray(Math.max(0, data.length - 4096)).toString('latin1').includes('%%EOF')) {
    throw new Error(`${relative}: PDF nemá koncový marker %%EOF`);
  }
  const actual = sha256(data);
  if (actual !== expectedHash) {
    throw new Error(`${relative}: SHA-256 ${actual} neodpovídá očekávanému ${expectedHash}`);
  }
  console.log(`PDF VERIFIED ${relative} ${actual} ${data.length} B`);
}

console.log(`Materializováno a kryptograficky ověřeno ${expected.size}/9 PDF Godota z jediného kanonického archivu a dvou historických blobů.`);
