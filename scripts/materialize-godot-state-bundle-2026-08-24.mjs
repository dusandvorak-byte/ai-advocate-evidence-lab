import { spawn } from 'node:child_process';

const run = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
});

async function main() {
  try {
    await run('python3', ['-c', 'import reportlab']);
  } catch {
    await run('python3', ['-m', 'pip', 'install', '--disable-pip-version-check', 'reportlab']);
  }
  await run('python3', ['scripts/materialize-godot-state-text-pdfs.py']);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
