import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import { createHash } from 'node:crypto';
import { indexJusticeSlalomHardeningEvidence } from './justice-slalom-pdf-provenance.mjs';
import { historicalOriginals, verifyHistoricPdfIdentity, verifyHistoricPrimaryProvenance } from './interpelace-380-integrity.mjs';

const id = 'doc-cz-psp-2018-12-17-interpelace-380';
const registry = JSON.parse(await readFile('project-memory/documents-2026.json','utf8'));
const records = registry.documents.filter(d => d.id === id);
if (records.length !== 1) throw new Error('Historical canonical record missing or duplicated');
const record = records[0];
const contract = JSON.parse(await readFile('project-memory/private-redaction-policy-contract.json','utf8'));
const report = JSON.parse(await readFile('project-memory/privacy-hardening-report.json','utf8'));
if (contract.status !== 'binding' || !/^[0-9a-f]{64}$/.test(contract.approved_policy_hmac || '')
    || report.schema_version !== '1.2' || report.policy_file !== 'scripts/publication_redaction.py'
    || report.policy_sha256 !== createHash('sha256').update(await readFile(report.policy_file)).digest('hex')) {
  throw new Error('Historical PDF hardening report identity mismatch');
}
const { hardeningReportOk, hardeningById } = indexJusticeSlalomHardeningEvidence(report, {
  expectedAuthenticatedPolicyIdentity: contract.approved_policy_hmac,
});
if (!hardeningReportOk) throw new Error('Historical PDF hardening report is not authenticated and clean');
verifyHistoricPrimaryProvenance(historicalOriginals[0], record, hardeningById.get(id));
const response = historicalOriginals[1];
if (record.public?.response_pdf !== response.path.slice(4)
    || record.public?.response_sha256 !== response.originalSha
    || record.public?.response_size_bytes !== response.originalSize
    || record.public?.response_page_count !== response.pages) throw new Error('Historical response provenance mismatch');

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
console.log('Interpellation 380 archived originals and pinned public PDFs, two languages and all 6 index links validated');
