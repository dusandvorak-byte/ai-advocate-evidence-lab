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
  const { stdout } = await execFileAsync('git', ['cat-file', 'blob', oid], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  blobCache.set(oid, stdout);
  return stdout;
}

async function accept(data, source) {
  if (!Buffer.isBuffer(data) || data.length < 5 || data.subarray(0, 5).toString() !== '%PDF-') return false;
  const h = sha256(data), rel = expected.get(h);
  if (!rel) return false;
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), data);
  found.add(rel);
  console.log(`HISTORY BLOB VERIFIED ${rel} ${h} source=${source}`);
  return true;
}

async function inspect(data, source) {
  if (await accept(data, source)) return true;
  const isXz = data.length >= 6 && data[0] === 0xfd && data[1] === 0x37 && data[2] === 0x7a && data[3] === 0x58 && data[4] === 0x5a && data[5] === 0x00;
  if (!isXz) return false;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'blob-recovery-'));
  const f = path.join(dir, 'x.xz');
  try {
    await writeFile(f, data);
    const { stdout } = await execFileAsync('xz', ['-dc', f], { encoding: null, maxBuffer: 96 * 1024 * 1024 });
    if (await accept(stdout, `${source}:xz`)) return true;
    const tar = path.join(dir, 'x.tar'), out = path.join(dir, 'out');
    await writeFile(tar, stdout); await mkdir(out);
    try {
      await execFileAsync('tar', ['-xf', tar, '-C', out], { maxBuffer: 96 * 1024 * 1024 });
      const stack = [out];
      while (stack.length) {
        const d = stack.pop();
        for (const e of await readdir(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) stack.push(p);
          else await accept(await readFile(p), `${source}:tar:${path.relative(out, p)}`);
        }
      }
    } catch {}
  } catch {} finally { await rm(dir, { recursive: true, force: true }); }
  return false;
}

function base64Text(data) {
  if (!data || data.length < 8 || data.length > 12 * 1024 * 1024) return null;
  let s;
  try { s = data.toString('utf8').replace(/\s+/g, ''); } catch { return null; }
  if (s.length < 8 || s.length % 4 === 1 || !/^[A-Za-z0-9+/=]+$/.test(s)) return null;
  return s;
}

function tokens(p) {
  const stop = new Set(['project','memory','binary','final','source','sources','recovery','bundle','bundles','chunk','chunks','document','documents','report','web','pdf','b64','xz','original','upload','uploads']);
  return new Set(p.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !stop.has(t) && !/^20\d{2}$/.test(t)));
}
function overlap(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

const { stdout: list } = await execFileAsync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024 });
const objects = new Map();
for (const line of list.split('\n')) {
  const i = line.indexOf(' '); if (i < 0) continue;
  const oid = line.slice(0, i), p = line.slice(i + 1);
  if (!objects.has(oid)) objects.set(oid, p);
}
console.log(`HISTORY OBJECTS ${objects.size}`);

// 1) Přesné binární PDF/XZ a jednotlivě dekódovatelné base64 zdroje. Záměrně
// kontrolujeme i netypické názvy, pokud vypadají jako historický důkazní zdroj.
const likely = /(?:\.pdf$|\.xz$|\.b64$|binary|bundle|source|127234|49467|gfaa|msz|necinnost|uvk|43826|3103|prostejov|stiznost|rozklad|policie)/i;
const b64Pieces = [];
const tails = [];
for (const [oid, p] of objects) {
  if (found.size === expected.size) break;
  if (!likely.test(p)) continue;
  let data; try { data = await blob(oid); } catch { continue; }
  await inspect(data, `git:${p}@${oid}`);
  const s = base64Text(data);
  if (!s) continue;
  try { await inspect(Buffer.from(s, 'base64'), `git-b64:${p}@${oid}`); } catch {}
  const base = path.posix.basename(p);
  const m = base.match(/^(?:chunk-)?(\d{1,3})(?:-(\d{1,3}))?\.b64$/i);
  const item = { oid, p, base, text: s, tok: tokens(p) };
  if (m) {
    item.start = Number(m[1]); item.end = m[2] ? Number(m[2]) : item.start;
    if (item.end >= item.start && item.end - item.start <= 80) b64Pieces.push(item);
  } else if (/\.b64$/i.test(base)) tails.push(item);
}
console.log(`GLOBAL B64 PARTS ${b64Pieces.length}; TAILS ${tails.length}`);

// 2) Globální union solver napříč adresáři a větvemi. To je podstatná pojistka:
// jednotlivé části jednoho původního PDF mohly skončit v různých pracovních adresářích.
// Spojujeme pouze souvislé číselné rozsahy, začínáme částí 0 s PDF/XZ signaturou a
// výsledek přijmeme pouze při shodě jednoho z devíti kanonických SHA-256.
const byStart = new Map();
for (const p of b64Pieces) {
  if (!byStart.has(p.start)) byStart.set(p.start, []);
  byStart.get(p.start).push(p);
}
const starts = (byStart.get(0) || []).filter(p => p.text.startsWith('JVBERi0') || p.text.startsWith('/Td6WFo'));
let attempts = 0;
const MAX_ATTEMPTS = 30000;
const tried = new Set();

async function testEncoded(encoded, label) {
  if (!encoded || encoded.length < 8 || encoded.length % 4 === 1) return;
  const sig = sha256(Buffer.from(encoded.slice(0, Math.min(encoded.length, 4096))));
  const key = `${encoded.length}:${sig}`;
  if (tried.has(key)) return;
  tried.add(key); attempts++;
  try { await inspect(Buffer.from(encoded, 'base64'), label); } catch {}
}

for (const first of starts) {
  if (found.size === expected.size || attempts >= MAX_ATTEMPTS) break;
  const seed = first.tok;
  const chosen = [first];
  async function dfs(next, encoded) {
    if (found.size === expected.size || attempts >= MAX_ATTEMPTS) return;
    await testEncoded(encoded, `union:${chosen.map(p => `${p.p}@${p.oid.slice(0,7)}`).join('+')}`);

    // Nenumerický historický konec (typicky *.xz.b64) se smí připojit jen při
    // sémantické vazbě na začátek, aby nevznikla nekontrolovaná kartézská exploze.
    for (const tail of tails) {
      if (attempts >= MAX_ATTEMPTS) break;
      if (overlap(seed, tail.tok) > 0) await testEncoded(encoded + tail.text, `union-tail:${chosen.map(p => p.p).join('+')}+${tail.p}`);
    }

    let opts = (byStart.get(next) || []).filter(p => overlap(seed, p.tok) > 0 || overlap(first.tok, p.tok) > 0);
    opts = opts.sort((a, b) => overlap(seed, b.tok) - overlap(seed, a.tok) || (b.end - b.start) - (a.end - a.start));
    // Stejný rozsah může mít mnoho historických verzí. Zachováme všechny, ale tvrdě
    // omezíme větev; správnost stejně určuje až kryptografický hash výsledku.
    for (const p of opts.slice(0, 24)) {
      chosen.push(p);
      await dfs(p.end + 1, encoded + p.text);
      chosen.pop();
      if (found.size === expected.size || attempts >= MAX_ATTEMPTS) return;
    }
  }
  await dfs(first.end + 1, first.text);
}
console.log(`GLOBAL UNION COMPLETE attempts=${attempts} found=${found.size}/${expected.size}`);

// 3) Diagnostická pojistka pro budoucí regresi: nikdy nevydáváme „nalezeno“ bez přesného
// hashového důkazu a nikdy nevyžadujeme historický 108dílný monolit jako jediný zdroj.
console.log(`HISTORY BLOB RECOVERY ${found.size}/${expected.size}`);
