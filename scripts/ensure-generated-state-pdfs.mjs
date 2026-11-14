// Reconstruct generated public PDF derivatives when their inputs, generator,
// redaction policy or output bytes differ from the last verified local build.
// The state file is build-local and deliberately not a publication authority.
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = 'web/documents/report-04082026-010';
const STATE_MANIFEST = '.evidence-lab-build/generated-state-pdf-signatures.json';

export const generatorGroups = [
  {
    generator: 'scripts/materialize-godot-state-text-pdfs.py',
    files: [
      '64-msz-praha-2-kzn-55-2025-136-2026-08-20.pdf',
      '65-ku-4139-12-cj-2026-2305km-2026-08-20.pdf',
      '66-krpt-203594-7-cj-2026-0700kr-2026-08-20.pdf',
      '67-krpt-priloha-rr-ku-54-2021.pdf',
      '68-krpt-priloha-rr-ku-54-2021-priloha-1.pdf',
      '69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf',
      '70-krpt-203594-8-cj-2026-0700kr-2026-08-20.pdf',
      '71-ppr-44020-2-cj-2026-990210-pd-2026-08-24.pdf',
    ],
  },
  {
    generator: 'scripts/materialize-godot-late-state-pdfs.py',
    files: [
      '72-md-46042-2026-010-4-2026-08-18.pdf',
      '73-msz-praha-2-kzn-683-2026-31-2026-08-24.pdf',
      '74-ms-praha-15-a-44-2026-43-2026-08-25.pdf',
      '75-os-prostejov-15-nt-3106-2026-predvolani-2026-08-25.pdf',
      '76-os-prostejov-15-nt-3106-2026-neslouceni-2026-08-25.pdf',
    ],
  },
  {
    generator: 'scripts/materialize-uoou-2026-08-26.py',
    files: [
      '77-uoou-05841-26-3-2026-08-26.pdf',
      '78-ks-ostrava-st-82-2026-15-t-11-2025-2026-08-26.pdf',
      '79-szu-10724-2026-2026-08-25.pdf',
      '80-szu-10724-2026-rozhodnuti-2026-08-26.pdf',
      '81-msz-praha-3-kzn-974-2026-100-2026-08-27.pdf',
      '82-ms-praha-8-ad-9-2026-85-2026-08-28.pdf',
      '83-msz-praha-3-kzn-974-2026-103-2026-08-27.pdf',
      '84-mk-53547-2026-socns-2026-08-31.pdf',
      '85-mk-53559-2026-socns-2026-08-31.pdf',
      '87-msz-praha-3-kzn-974-2026-108-2026-09-01-verejna-kopie.pdf',
    ],
  },
  {
    generator: 'scripts/materialize-euda-2026-09-25.py',
    files: [
      '101-euda-exo-fhp-pd-26-d-106-2026-09-25-verejna-kopie.pdf',
    ],
  },
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

export async function sha256File(file) {
  const contents = await readFile(file);
  return createHash('sha256').update(contents).digest('hex');
}

const run = (command, args, cwd, capture = false) => new Promise((resolveRun, reject) => {
  const chunks = [];
  const child = spawn(command, args, { cwd, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (capture) child.stdout.on('data', chunk => chunks.push(chunk));
  child.on('error', reject);
  child.on('exit', code => code === 0
    ? resolveRun(capture ? Buffer.concat(chunks).toString('utf8') : undefined)
    : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
});

export async function currentInputSignatures(root = process.cwd()) {
  const output = await run('python3', ['scripts/generated_pdf_signatures.py'], root, true);
  const parsed = JSON.parse(output);
  if (!parsed?.groups) throw new Error('Generated PDF input signature helper returned no groups');
  return parsed;
}

export async function readBuildState(root = process.cwd()) {
  try {
    return JSON.parse(await readFile(join(root, STATE_MANIFEST), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { schema_version: '1.0', groups: {} };
    throw error;
  }
}

export async function staleGeneratedGroups(root, signatures, state = undefined) {
  const previous = state ?? await readBuildState(root);
  const pending = [];
  for (const group of generatorGroups) {
    const expected = signatures.groups?.[group.generator];
    if (!expected?.input_fingerprint) {
      throw new Error(`Missing input fingerprint for ${group.generator}`);
    }
    const prior = previous.groups?.[group.generator];
    const reasons = [];
    if (!prior) {
      reasons.push('missing_build_signature');
    } else if (prior.input_fingerprint !== expected.input_fingerprint) {
      reasons.push('input_fingerprint_changed');
    }

    for (const filename of group.files) {
      const file = join(root, PUBLIC_DIR, filename);
      if (!await usablePdf(file)) {
        reasons.push(`unusable:${filename}`);
        continue;
      }
      if (prior?.outputs?.[filename]) {
        const actual = await sha256File(file);
        if (actual !== prior.outputs[filename]) reasons.push(`output_sha_changed:${filename}`);
      } else {
        reasons.push(`missing_output_sha:${filename}`);
      }
    }
    if (reasons.length) pending.push({ ...group, reasons: [...new Set(reasons)] });
  }
  return pending;
}

export async function buildState(root, signatures) {
  const groups = {};
  for (const group of generatorGroups) {
    const expected = signatures.groups[group.generator];
    const outputs = {};
    for (const filename of group.files) {
      const file = join(root, PUBLIC_DIR, filename);
      if (!await usablePdf(file)) {
        throw new Error(`Cannot record unusable generated PDF: ${filename}`);
      }
      outputs[filename] = await sha256File(file);
    }
    groups[group.generator] = {
      input_fingerprint: expected.input_fingerprint,
      components: expected.components,
      outputs,
    };
  }
  return { schema_version: '1.0', groups };
}

export async function writeBuildState(root, state) {
  const target = join(root, STATE_MANIFEST);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function main() {
  const root = process.cwd();
  const signatures = await currentInputSignatures(root);
  const pending = await staleGeneratedGroups(root, signatures);

  for (const group of pending) {
    console.log(`Regenerating ${group.generator}: ${group.reasons.join(', ')}`);
    await run('python3', [group.generator], root);
    for (const filename of group.files) {
      if (!await usablePdf(join(root, PUBLIC_DIR, filename))) {
        throw new Error(`Generator ${group.generator} did not produce usable PDF: ${filename}`);
      }
    }
  }

  const finalState = await buildState(root, signatures);
  await writeBuildState(root, finalState);
  console.log(`Generated PDF provenance preflight: ${generatorGroups.length - pending.length} groups reused, ${pending.length} regenerated; source/generator/redaction fingerprints and output SHA-256 recorded`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
