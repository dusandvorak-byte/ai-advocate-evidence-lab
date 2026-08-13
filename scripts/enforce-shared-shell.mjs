import { readFile, writeFile } from 'node:fs/promises';

const targets = [
  'web/index.html',
  'web/en.html',
  'web/kc/index.html',
  'web/kc/en.html',
  'web/zpravy/04082026-010.html'
];
const tag = '<link rel="stylesheet" href="shell-axis.css">';

for (const path of targets) {
  let html = await readFile(path, 'utf8');
  html = html.replace(/\s*<link rel="stylesheet" href="shell-axis\.css">/g, '');
  if (!html.includes('</head>')) throw new Error(`${path}: chybí </head>`);
  html = html.replace('</head>', `  ${tag}\n</head>`);
  await writeFile(path, html, 'utf8');
}

console.log(`Společná osa rámů vynucena na ${targets.length} veřejných plochách.`);
