import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const root = path.resolve('web');
const htmlFiles = (await walk(root)).filter(file => file.endsWith('.html'));
const failures = [];

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const baseMatch = html.match(/<base\s+href="([^"]+)"/i);
  const baseDirectory = baseMatch
    ? path.resolve(path.dirname(file), baseMatch[1])
    : path.dirname(file);
  const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/gi)].map(match => match[1]);

  for (const reference of references) {
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(reference)) continue;
    const clean = reference.split(/[?#]/, 1)[0];
    if (!clean) continue;
    const target = reference.startsWith('/')
      ? path.join(root, clean.replace(/^\/ai-advocate-evidence-lab\//, '').replace(/^\//, ''))
      : path.resolve(baseDirectory, clean);
    try {
      await access(target);
    } catch {
      failures.push(`${path.relative(root, file)} → ${reference}`);
    }
  }
}

assert.deepEqual(failures, [], `Broken public references:\n${failures.join('\n')}`);
console.log(`Public link tests: ${htmlFiles.length} HTML files passed`);
