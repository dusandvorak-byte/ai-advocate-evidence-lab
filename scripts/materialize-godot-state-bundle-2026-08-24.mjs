import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const run = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
});

async function patchEnglishTimerTranslations() {
  const file = 'project-memory/english-process-timer-translations.json';
  const data = JSON.parse(await readFile(file, 'utf8'));
  data.timers ||= {};
  const additions = {
    'timer-remedy-doc-cz-ekk-dd-gf-2026-08-24-ostrava-frydek-brno-doplneni': {
      title: 'Ostrava, Frýdek-Místek and Brno branches – urgent evidentiary supplement',
      event: 'The filing of 24 August 2026 submitted the new Police records of 20 and 24 August and requested coordinated consideration of the connected criminal, review and supervisory branches.'
    },
    'timer-remedy-doc-cz-dd-2026-08-22-ks-brno-9-to-315-316-doplneni': {
      title: 'Brno Regional Court, cases 9 To 315/2026 and 9 To 316/2026 – urgent supplement to the complaints',
      event: 'The filing of 22 August 2026 submitted the new Police records of 20 August and requested that they be assessed together with the pending complaints and the related reopening branch.'
    }
  };
  let changed = 0;
  for (const [id, value] of Object.entries(additions)) {
    if (!data.timers[id]) {
      data.timers[id] = value;
      changed++;
    }
  }
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`English timer translation patch: ${changed} added`);
}

async function main() {
  try {
    await run('python3', ['-c', 'import reportlab']);
  } catch {
    await run('python3', ['-m', 'pip', 'install', '--disable-pip-version-check', 'reportlab']);
  }
  await run('python3', ['scripts/materialize-godot-state-text-pdfs.py']);
  await patchEnglishTimerTranslations();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
