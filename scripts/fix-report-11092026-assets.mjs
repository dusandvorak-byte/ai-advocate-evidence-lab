import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const reportId = '11092026-013';
const oldImage = '/ai-advocate-evidence-lab/assets/votruba/zpivej-kopie.jpg';
const oldRelativeImage = 'assets/votruba/zpivej-kopie.jpg';
const exactImage = '/ai-advocate-evidence-lab/assets/votruba/sing.jpg';
const exactRelativeImage = 'assets/votruba/sing.jpg';
const expectedSha256 = '14b101ce67243ec9bb6815470f108bbf45e532c6ba4a007ab88d827f73141756';

const imageBytes = await readFile('web/assets/votruba/sing.jpg');
const imageSha256 = createHash('sha256').update(imageBytes).digest('hex');
if (imageSha256 !== expectedSha256) {
  throw new Error(`Votruba gate: web/assets/votruba/sing.jpg SHA-256 ${imageSha256} != ${expectedSha256}`);
}

const targets = [
  'web/zpravy/11092026-013.html',
  'web/news/11092026-013.html',
  'web/index.html',
  'web/en.html',
  'web/kc/index.html',
  'web/kc/en.html'
];

for (const path of targets) {
  let html = await readFile(path, 'utf8');
  html = html.replaceAll(oldImage, exactImage).replaceAll(oldRelativeImage, exactRelativeImage);
  if (!html.includes('assets/votruba/sing.jpg')) {
    throw new Error(`Votruba gate: ${path} neodkazuje na přesný originál sing.jpg`);
  }
  if (html.includes('assets/votruba/zpivej-kopie.jpg')) {
    throw new Error(`Votruba gate: ${path} stále odkazuje na chybnou kopii`);
  }
  await writeFile(path, html, 'utf8');
}

console.log(`Report ${reportId}: exact Jiří Votruba original enforced on CZ/EN and church surfaces.`);
