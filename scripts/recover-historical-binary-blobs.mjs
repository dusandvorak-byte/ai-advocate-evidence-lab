import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const root = 'web';

// Stabilní historické PDF jsou již přítomny jako git blobs. Obnovujeme je přímo
// podle jejich git object ID a vždy ověřujeme SHA-256 obsahu. Nové listiny 64–71
// se materializují samostatným krokem z ověřených textových přepisů.
const expected = [
  { oid: 'ad7a3073b43473277aba2caf524bf9f2e791be0a', sha256: 'c65c9cc5f12eab03f69c4ea1bf642c3078f4858153b385e80f141da6ea334a55', rel: 'documents/report-04082026-010/25-mv-127234-2-obp-2026-2026-08-11.pdf' },
  { oid: 'e0832de4a1031f149aae414477ccddbcd77585d0', sha256: '769392aa996dda284c927b9bee9fbee1c364daade8d2a1867fe7fa380d4b3cc2', rel: 'documents/report-04082026-010/26-gfaa-rozklad-mv-127234-2-obp-2026-2026-08-12.pdf' },
  { oid: '86fc13e83e329fcc127ea4a011309073449ca972', sha256: 'bb23820c9a02a17a976f0a746def4c53f4afa413fb708259e25a59d6a2f0f3b1', rel: 'documents/report-04082026-010/27-mk-49467-2026-socns-2026-08-12.pdf' },
  { oid: '158c83a6606f2216f60c93d03473ddc3628a5781', sha256: '021a9c83a3079ab0b6e26205c510e6d8b1633dfe3c30c57c3048538942fb91b3', rel: 'documents/report-04082026-010/28-dvorak-odvolani-nsz-sin-55-2026-19-2026-08-01.pdf' },
  { oid: '6390ad22a54d50eca0794b913a7a22f975fcbc0c', sha256: '564fa5536735679523d976664eb805fa82987c7699134a15f483c530b4a40e02', rel: 'documents/report-04082026-010/29-dvorak-odvolani-msz-sin-48-2026-12-2026-07-31.pdf' },
  { oid: '3f9eaa188dae6f5270eaaa27cd0081c0440a60a0', sha256: '77e623a6b0af714d479ec8b8c4fda8ea3fef0d2330f0dc6fcf541258c73e9dec', rel: 'documents/report-04082026-010/30-dvorak-stiznost-msz-necinnost-infz-2026-07-31.pdf' },
  { oid: '6b991f6c4e2eeb869a112312bfd048472c90eb81', sha256: '823d7ec58d9ed6de4abde4f0636eb1d87d9d16c331ac7d143c2342621999c88c', rel: 'documents/report-04082026-010/31-policie-uvk-pp-ppr-43826-2-cj-2026-990210-pd-2026-08-14.pdf' },
  { oid: '64aabeed51840cb904591d0d559f0232133c4d45', sha256: 'f74b439f6d99826a7f49b32e08e2f908017c4e840a2b8837dd241fbc582f765d', rel: 'documents/report-04082026-010/32-dvorak-stiznost-uvk-pp-pcr-2026-08-14.pdf' },
  { oid: '48850954852c5d14f3d3384ea5d293db09f60223', sha256: 'd461ad6eacc569ba8d86c4ce640a3f6273ff67ae48fc5ea57f1f8653ce0e2a40', rel: 'documents/report-04082026-010/33-os-prostejov-15-nt-3103-2026-53-2026-08-07.pdf' },
];

const sha256 = data => createHash('sha256').update(data).digest('hex');

for (const item of expected) {
  const { stdout } = await execFileAsync('git', ['cat-file', 'blob', item.oid], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (stdout.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error(`Historický blob není PDF: ${item.rel} (${item.oid})`);
  }
  const actual = sha256(stdout);
  if (actual !== item.sha256) {
    throw new Error(`SHA-256 mismatch ${item.rel}: ${actual} != ${item.sha256}`);
  }
  const target = path.join(root, item.rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, stdout);
  console.log(`HISTORY BLOB VERIFIED ${item.rel} ${actual} source=git:${item.oid}`);
}

console.log(`HISTORY BLOB RECOVERY ${expected.length}/${expected.length}`);
