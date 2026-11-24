import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join, basename} from 'node:path';
import {pathToFileURL} from 'node:url';

const id = 'doc-cz-dd-2026-11-23-os-praha4-10-c-69-2026-ct-doplneni';
const approved = '13762205a406156e15e488c3936523facd10ee55f24c5c7fa908f924440a7aa8';
const sourceOriginal = 'fed3669ffdef7f3fdd6be4a79dd330eb6b1ac34851342e630685e7cd4df860ad';
const pdf = 'documents/2026-11-23/2026-11-23-os-praha4-10-c-69-2026-ct-doplneni.pdf';
const size = 1306798;
const archive = '3384f9ea02b4f061629af22329368e40ddf58689';
const reason = 'technical_privacy_hold_2026-11-24_pending_reapproval';
const status = 'APPROVED_BINARY_HELD_PRIVACY_REPROCESSING_REQUIRED';
const receiptPath = '.release/pending/ct-pilot-2026-11-23.json';
const supplementPath = 'project-memory/documents-2026-supplement-2026-11-23-ct-pilot.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error('CT PILOT HOLD: ' + message); };
const readJson = async path => JSON.parse(await readFile(path,'utf8'));

// Separate, explicitly fail-closed safety hold. The exact prior approval is
// NOT transferred to newly hardened bytes. No held document or copy may appear
// in either final tree, including under a renamed path.
export async function verifyHeldCtPublicRoot(root, pins = {id, pdf, approved, sourceOriginal, size}) {
  const markers = [pins.id, basename(pins.pdf), pins.approved, pins.sourceOriginal].map(s => Buffer.from(s));
  async function scan(dir) {
    for (const entry of await readdir(dir, {withFileTypes:true})) {
      const path = join(dir,entry.name);
      if (entry.name.includes(pins.id) || entry.name.includes(basename(pins.pdf))) fail('held path leaked');
      if (entry.isDirectory()) { await scan(path); continue; }
      if (!entry.isFile()) fail('non-regular entry in publication tree');
      const bytes = await readFile(path);
      if (bytes.length === pins.size && digest(bytes) === pins.approved) fail('held approved binary leaked');
      if (markers.some(marker => bytes.includes(marker))) fail('held identifier, path or digest leaked');
      if (bytes.subarray(0,5).toString() === '%PDF-' && digest(bytes) === pins.sourceOriginal) fail('held source binary leaked');
    }
  }
  await scan(root);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--staged')) fail('unknown verification mode');
  const receipt = await readJson(receiptPath);
  if (receipt.document_id !== id || receipt.public_sha256 !== approved ||
      receipt.source_original_sha256 !== sourceOriginal || receipt.public_size_bytes !== size ||
      receipt.page_count !== 10 || receipt.publish !== false || receipt.status !== status ||
      receipt.proposed_public_path !== pdf || receipt.staged_pdf_path !== null ||
      receipt.archived_approved_commit !== archive || receipt.archived_approved_path !== 'web/'+pdf ||
      receipt.hold_reason !== reason) fail('exact approval or hold receipt differs');
  const archived = execFileSync('git',['show',archive+':web/'+pdf],{maxBuffer:16*1024*1024});
  if (archived.length !== size || digest(archived) !== approved) fail('archived exact approval differs');
  const batch = await readJson(supplementPath);
  const held = batch.documents.filter(d => d.id === id);
  if (held.length !== 1 || held[0].release_excluded !== true ||
      held[0].release_exclusion_reason !== reason || held[0].public?.pdf !== null ||
      held[0].public?.sha256 !== null || held[0].public?.approved_prior_public_sha256 !== approved)
    fail('source record is not explicitly held');
  const registries = args.length ? ['release-site/data/documents-2026.json','release-site/web/data/documents-2026.json']
    : ['project-memory/documents-2026.json','web/data/documents-2026.json'];
  for (const path of registries) {
    const registry = await readJson(path);
    if (!Array.isArray(registry.documents) || registry.documents.some(d => d.id === id)) fail('held record leaked into registry');
  }
  await verifyHeldCtPublicRoot(args.length ? 'release-site' : 'web');
  console.log('CT_PILOT_HELD_EXACT_APPROVAL_PRESERVED_AND_ABSENT '+(args.length?'staged tree':'terminal build'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
