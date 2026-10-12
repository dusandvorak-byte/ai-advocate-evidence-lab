import { readFile, writeFile } from 'node:fs/promises';

const documentId='doc-cz-dd-2026-10-12-osz-os-pro-infz-thc-obnova';
const date='2026-10-12';

const casesPath='project-memory/cases.json';
const cases=JSON.parse(await readFile(casesPath,'utf8'));
for (const id of ['case-cz-os-pro-2t104-2010-obnova','case-cz-os-pro-2t65-2011-obnova']) {
  const item=cases.cases.find(x=>x.id===id);
  if (!item) throw new Error('Missing case '+id);
  item.last_filing_on=date;
  item.last_filing_document_id=documentId;
  item.related_document_ids=item.related_document_ids || [];
  if (!item.related_document_ids.includes(documentId)) item.related_document_ids.push(documentId);
}
await writeFile(casesPath, JSON.stringify(cases,null,2)+'\n','utf8');

const docketsPath='project-memory/active-court-dockets.json';
const dockets=JSON.parse(await readFile(docketsPath,'utf8'));
for (const id of ['court-prostejov-2t104-15nt3104','court-prostejov-2t65-15nt3106']) {
  const item=dockets.rows.find(x=>x.id===id);
  if (!item) throw new Error('Missing docket '+id);
  item.slalom_document_ids=item.slalom_document_ids || [];
  if (!item.slalom_document_ids.includes(documentId)) item.slalom_document_ids.push(documentId);
}
await writeFile(docketsPath, JSON.stringify(dockets,null,2)+'\n','utf8');

console.log('APPLIED 2026-10-12 JUSTICE-SLALOM CASE LINKS', documentId);
