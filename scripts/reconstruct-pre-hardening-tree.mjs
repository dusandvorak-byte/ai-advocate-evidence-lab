import { spawn } from 'node:child_process';

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
  });
});

const node = script => run(process.execPath, [script]);
const python = script => run('python3', [script]);

await node('scripts/recover-historical-binary-blobs.mjs');
await node('scripts/materialize-godot-pdf-bundle.mjs');
await node('scripts/materialize-godot-state-bundle-2026-08-24.mjs');
await python('scripts/materialize-uoou-2026-08-26.py');
await python('scripts/materialize-euda-2026-09-25.py');
await python('scripts/materialize-state-pdfs-2026-09-03.py');
await node('scripts/prepare-md-english-build.mjs');

await node('scripts/validate-architecture.mjs');
await node('scripts/materialize-binary-sources.mjs');
await node('scripts/apply-justice-slalom-2026-10-12-case-links.mjs');
await python('scripts/materialize-pdf-release-2026-09-29.py');
await python('scripts/materialize-state-pdfs-2026-09-03.py');
await python('scripts/materialize-state-pdf-2026-10-01.py');
await python('scripts/materialize-october-court-pdfs.py');
await python('scripts/materialize-uoou-submission-2026-10-02.py');
await python('scripts/materialize-euda-access-documents-2026-10-01.py');
await python('scripts/materialize-ekk-evidence-2026-10-02.py');
await python('scripts/materialize-four-records-2026-10-03.py');
await python('scripts/materialize-state-responses-2026-10-07.py');
await python('scripts/materialize-mv-rozklad-2026-10-07.py');
await python('scripts/materialize-godot-filings-2026-10-08.py');
await python('scripts/materialize-justice-slalom-2026-10-12.py');
await python('scripts/materialize-2026-10-15-godot-slalom.py');
await python('scripts/materialize-redacted-originals-2026-10-16.py');
await python('scripts/validate-redacted-originals-2026-10-16.py');
await node('scripts/build-kasace-2026-10-30.mjs');
await node('scripts/build-late-evidence-2026-11-02.mjs');
await node('scripts/ensure-generated-state-pdfs.mjs');
await node('scripts/normalize-canonical-data.mjs');
await node('scripts/materialize-os-praha4-public-copy.mjs');

console.log('Exact pre-hardening public tree reconstructed for diagnostics.');
