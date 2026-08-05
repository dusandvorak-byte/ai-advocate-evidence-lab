import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const articlePath = 'web/zpravy/04082026-010.html';
const dataDir = 'web/data';
const registrySource = 'project-memory/documents-2026.json';
const institutionsSource = 'project-memory/institutions.json';
const registryTarget = `${dataDir}/documents-2026.json`;
const institutionsTarget = `${dataDir}/institutions.json`;
const scriptTag = '<script src="document-chronology.js" defer></script>';

await mkdir(dataDir, { recursive: true });
await copyFile(registrySource, registryTarget);
await copyFile(institutionsSource, institutionsTarget);

let article = await readFile(articlePath, 'utf8');
if (!article.includes(scriptTag)) {
  if (!article.includes('</body>')) {
    throw new Error(`${articlePath} nemá uzavírací značku </body>`);
  }
  article = article.replace('</body>', `${scriptTag}</body>`);
  await writeFile(articlePath, article, 'utf8');
}

const registry = JSON.parse(await readFile(registryTarget, 'utf8'));
if (!Array.isArray(registry.documents)) {
  throw new Error('Rejstřík documents-2026.json neobsahuje pole documents');
}
const ids = new Set();
for (const documentItem of registry.documents) {
  if (!documentItem.id || !documentItem.issue_date || !documentItem.institution_id) {
    throw new Error(`Neúplný dokument v rejstříku: ${JSON.stringify(documentItem)}`);
  }
  if (ids.has(documentItem.id)) {
    throw new Error(`Duplicitní stabilní ID dokumentu: ${documentItem.id}`);
  }
  ids.add(documentItem.id);
}

console.log(`Dynamická chronologie připravena: ${registry.documents.length} dokumentů.`);
