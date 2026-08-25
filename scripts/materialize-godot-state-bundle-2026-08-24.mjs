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

async function patchEnglishGodotTranslations() {
  const file = 'project-memory/english-godot-translations.json';
  const data = JSON.parse(await readFile(file, 'utf8'));
  data.documents ||= {};
  const additions = {
    'doc-cz-msz-pha-2026-08-20-2-kzn-55-2025-136': 'The Prague Municipal Public Prosecutor’s Office reviewed a series of filings and stated that it found no grounds to exercise supervisory powers under Section 157(2) of the Code of Criminal Procedure; it placed the identified submissions on file without further measures and informed the submitter of the possibility of review under Section 16a(7) of the Public Prosecutor’s Office Act.',
    'doc-cz-pcr-ku-2026-08-20-ku-4139-12-cj-2026-2305km': 'The Institute of Criminalistics stated that it was not aware of any error in the forensic work, referred to methodological and expert visits as a form of control and maintained that it was not required, at the submitter’s request, to re-examine the forensic procedures and methods used.',
    'doc-cz-pcr-krpt-2026-08-20-krpt-203594-7-cj-2026-0700kr': 'The Moravian-Silesian Regional Police Directorate partially answered the freedom-of-information request concerning SOPs and historical methodology at the Frýdek-Místek forensic unit, providing sampling material and information on methodological visits and destruction of records.',
    'doc-cz-pcr-krpt-2026-08-20-rr-ku-54-2021': 'Attachment to KRPT-203594-7/ČJ-2026-0700KR: Director of the Institute of Criminalistics Order No. 54/2021 concerning examination of cannabis and cannabinoids.',
    'doc-cz-pcr-krpt-2026-08-20-rr-ku-54-2021-priloha-1': 'Attachment to KRPT-203594-7/ČJ-2026-0700KR: methodology for taking a representative sample of plant material, Annex 1 to Director’s Order No. 54/2021.',
    'doc-cz-pcr-krpt-2026-08-20-metodicko-odborne-vyjezdy-okte': 'Attachment to KRPT-203594-7/ČJ-2026-0700KR: overview of methodological and expert visits, inter-laboratory tests and destruction records from 2009–2019.',
    'doc-cz-pcr-krpt-2026-08-20-krpt-203594-8-cj-2026-0700kr': 'Decision partially refusing the freedom-of-information request. The Police stated that the Frýdek-Místek forensic unit had no SOP for determining THC in 2009–2019, no written methodology for homogenisation or THC/THCA determination, no uncertainty-of-measurement methodology and no validation protocols; part of the historical control documentation had been destroyed.',
    'doc-cz-pcr-pp-2026-08-24-ppr-44020-2-cj-2026-990210-pd': 'The Internal Control Office of the Police Presidium declined superior review under Section 97(3) of the Police Act because the preceding mandatory examination under Section 97 by the competent Institute of Criminalistics had not taken place; it placed the filing of 15 August 2026 on file without further measures.'
  };
  let changed = 0;
  for (const [id, value] of Object.entries(additions)) {
    if (!data.documents[id]) {
      data.documents[id] = value;
      changed++;
    }
  }
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`English Godot state-document patch: ${changed} added`);
}

async function main() {
  try {
    await run('python3', ['-c', 'import reportlab']);
  } catch {
    await run('python3', ['-m', 'pip', 'install', '--disable-pip-version-check', 'reportlab']);
  }
  await run('python3', ['scripts/materialize-godot-state-text-pdfs.py']);
  await patchEnglishTimerTranslations();
  await patchEnglishGodotTranslations();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
