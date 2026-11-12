// Restore historical generated public PDF copies only when absent or unusable.
// Production CI pre-materializes these files; on a clean standalone build this
// reconciles the same documented text sources, never inventing source material.
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = 'web/documents/report-04082026-010';
export const generatorGroups = [
  {
    generator: "scripts/materialize-godot-state-text-pdfs.py",
    files: [
      "64-msz-praha-2-kzn-55-2025-136-2026-08-20.pdf",
      "65-ku-4139-12-cj-2026-2305km-2026-08-20.pdf",
      "66-krpt-203594-7-cj-2026-0700kr-2026-08-20.pdf",
      "67-krpt-priloha-rr-ku-54-2021.pdf",
      "68-krpt-priloha-rr-ku-54-2021-priloha-1.pdf",
      "69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf",
      "70-krpt-203594-8-cj-2026-0700kr-2026-08-20.pdf",
      "71-ppr-44020-2-cj-2026-990210-pd-2026-08-24.pdf"
    ]
  },
  {
    generator: "scripts/materialize-godot-late-state-pdfs.py",
    files: [
      "72-md-46042-2026-010-4-2026-08-18.pdf",
      "73-msz-praha-2-kzn-683-2026-31-2026-08-24.pdf",
      "74-ms-praha-15-a-44-2026-43-2026-08-25.pdf",
      "75-os-prostejov-15-nt-3106-2026-predvolani-2026-08-25.pdf",
      "76-os-prostejov-15-nt-3106-2026-neslouceni-2026-08-25.pdf"
    ]
  },
  {
    generator: "scripts/materialize-uoou-2026-08-26.py",
    files: [
      "77-uoou-05841-26-3-2026-08-26.pdf",
      "78-ks-ostrava-st-82-2026-15-t-11-2025-2026-08-26.pdf",
      "79-szu-10724-2026-2026-08-25.pdf",
      "80-szu-10724-2026-rozhodnuti-2026-08-26.pdf",
      "81-msz-praha-3-kzn-974-2026-100-2026-08-27.pdf",
      "82-ms-praha-8-ad-9-2026-85-2026-08-28.pdf",
      "83-msz-praha-3-kzn-974-2026-103-2026-08-27.pdf",
      "84-mk-53547-2026-socns-2026-08-31.pdf",
      "85-mk-53559-2026-socns-2026-08-31.pdf",
      "87-msz-praha-3-kzn-974-2026-108-2026-09-01-verejna-kopie.pdf"
    ]
  },
  {
    generator: "scripts/materialize-euda-2026-09-25.py",
    files: [
      "101-euda-exo-fhp-pd-26-d-106-2026-09-25-verejna-kopie.pdf"
    ]
  }
];

export async function usablePdf(file) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 1024) return false;
    const contents = await readFile(file);
    return contents.subarray(0, 5).toString('ascii') === '%PDF-'
      && contents.subarray(Math.max(0, contents.length - 2048)).toString('latin1').includes('%%EOF');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function missingGeneratedGroups(root = process.cwd()) {
  const pending = [];
  for (const group of generatorGroups) {
    const missing = [];
    for (const filename of group.files) {
      if (!await usablePdf(join(root, PUBLIC_DIR, filename))) missing.push(filename);
    }
    if (missing.length) pending.push({ ...group, missing });
  }
  return pending;
}

const run = (command, args, cwd) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0
    ? resolveRun()
    : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
});

async function main() {
  const root = process.cwd();
  const pending = await missingGeneratedGroups(root);
  for (const group of pending) {
    console.log(`Missing ${group.missing.length} verified public PDF copies; running ${group.generator}`);
    await run('python3', [group.generator], root);
    for (const filename of group.files) {
      if (!await usablePdf(join(root, PUBLIC_DIR, filename))) {
        throw new Error(`Generator ${group.generator} did not produce usable PDF: ${filename}`);
      }
    }
  }
  console.log(`Generated PDF preflight: ${generatorGroups.length - pending.length} groups already valid, ${pending.length} regenerated`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
