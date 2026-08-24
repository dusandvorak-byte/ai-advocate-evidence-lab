import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const chunksDir = 'project-memory/binary-bundle-2026-08-24-state';
const archivePath = '/tmp/godot-state-2026-08-24.tar.xz';
const outputRoot = 'web';
const expectedArchiveSha256 = '0338f8ec8ef1c814a832616ec098cd4f262a63a8b83fc57aa7d3d5a7a2b870b5';
const expected = {
  'documents/report-04082026-010/64-msz-praha-2-kzn-55-2025-136-2026-08-20.pdf': 'c24e4cf837f1ab70241c7b597846aa59df29b95a9b60a2f3c9c01e3f66e6cc3b',
  'documents/report-04082026-010/65-ku-4139-12-cj-2026-2305km-2026-08-20.pdf': 'a4a4b274aa1607181344240937b6a96f33a09cbefa2bfac5308e418aa1cfb9a3',
  'documents/report-04082026-010/66-krpt-203594-7-cj-2026-0700kr-2026-08-20.pdf': 'cae03ec6d647aa39064260a52164549849483b53816030656548a8f9666dac68',
  'documents/report-04082026-010/67-krpt-priloha-rr-ku-54-2021.pdf': 'dfac68dbff3515010d51a2dbf79e0b62b0e509ccebcca694096b6db090b71e4c',
  'documents/report-04082026-010/68-krpt-priloha-rr-ku-54-2021-priloha-1.pdf': '052d465511629241c5372effec61219cec92ed8127ff81c4054f6a33bf20402e',
  'documents/report-04082026-010/69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf': 'a98a173c6eaebb6d39131d8888da0eeff09c0bcee3fb217d1ed0b790c5e23444',
  'documents/report-04082026-010/70-krpt-203594-8-cj-2026-0700kr-2026-08-20.pdf': '24a8650b8933ac4b6c9cb5b37e3318c4bbbccf3b47cd089e94d25c3ba3c97a68',
  'documents/report-04082026-010/71-ppr-44020-2-cj-2026-990210-pd-2026-08-24.pdf': '4a9a7fdd5857bf403946ada1ea39ab4994bf9371aae36553841de749cd85969d'
};

const run = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} skončil kódem ${code}`)));
});

const names = (await readdir(chunksDir)).filter(name => /^chunk-\d{3}\.b64$/.test(name)).sort();
if (!names.length) throw new Error('Chybí binární chunk soubory státních PDF 20.–24. 8. 2026.');
for (let i = 0; i < names.length; i += 1) {
  const expectedName = `chunk-${String(i).padStart(3, '0')}.b64`;
  if (names[i] !== expectedName) throw new Error(`Binární balík není souvislý: očekáváno ${expectedName}, nalezeno ${names[i]}.`);
}
let encoded = '';
for (const name of names) encoded += (await readFile(`${chunksDir}/${name}`, 'utf8')).trim();
const archive = Buffer.from(encoded, 'base64');
const archiveHash = createHash('sha256').update(archive).digest('hex');
if (archiveHash !== expectedArchiveSha256) throw new Error(`SHA-256 binárního balíku nesedí: ${archiveHash}`);
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
console.log(`Materializováno a SHA-256 ověřeno ${Object.keys(expected).length} nových státních PDF pro Godot.`);
