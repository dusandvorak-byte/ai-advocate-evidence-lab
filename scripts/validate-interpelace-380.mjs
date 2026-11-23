import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import { historicalOriginals, verifyHistoricPdfIdentity } from './interpelace-380-integrity.mjs';

for (const spec of historicalOriginals) {
  // Source is pinned to the checked-out git object and cannot be replaced by a
  // separately generated registry, privacy report or public derivative.
  const original = execFileSync('git', ['show', 'HEAD:' + spec.path], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const publicCopy = await readFile(spec.path);
  const identity = verifyHistoricPdfIdentity(spec, original, publicCopy);
  const info = execFileSync('pdfinfo', [spec.path], { encoding: 'utf8' });
  if (!new RegExp('^Pages:\\s+' + identity.pages + '\\s*$', 'm').test(info)) {
    throw new Error('Public PDF page mismatch: ' + spec.path);
  }
  console.log('INTERPELACE380_VALIDATED ' + JSON.stringify({
    path: spec.path, original_sha256: identity.originalSha,
    public_sha256: identity.publicSha, kind: identity.alteredPublicCopy ?
      'privacy_hardened_public_copy' : 'byte_identical_original',
    pages: identity.pages,
  }));
}

for(const page of ['web/listiny/2018-interpelace-380.html','web/listiny/2018-interpellation-380-en.html']){const text=await readFile(page,'utf8');if(!text.includes('documents/interpelace-380-2018/interpelace-zuzana-majerova-zahradnikova-2018.pdf')||!text.includes('documents/interpelace-380-2018/odpoved-andrej-babis-interpelace-380.pdf'))throw Error('PDF links missing '+page);}
for(const page of ['web/index.html','web/en.html','web/kc/index.html','web/kc/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html']){if(!(await readFile(page,'utf8')).includes('id="historical-interpellation-380"'))throw Error('No historical index '+page);}
console.log('Interpellation 380 original PDFs, two languages and all 6 index links validated');
