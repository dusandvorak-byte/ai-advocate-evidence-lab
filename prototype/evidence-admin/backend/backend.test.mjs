import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPdfForQuarantine, MAX_PDF_BYTES } from './pdf-gate.mjs';
import { advanceReview } from './review-workflow.mjs';

const synthetic = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const record = () => ({ state:'draft',version:0,created_by:'author',metadata_complete:false,public_copy_reviewed:false,content_approved:false });

test('accepts synthetic PDF only for quarantine',()=>{
  const x=inspectPdfForQuarantine(synthetic);
  assert.equal(x.accepted,true);
  assert.equal(x.status,'requires_quarantine_and_malware_scan');
  assert.match(x.sha256,/^[a-f0-9]{64}$/);
});
test('rejects wrong MIME',()=>assert.equal(inspectPdfForQuarantine(synthetic,'image/png').accepted,false));
test('rejects wrong magic',()=>assert.equal(inspectPdfForQuarantine(Buffer.from('not a PDF %%EOF')).accepted,false));
test('rejects missing EOF',()=>assert.equal(inspectPdfForQuarantine(Buffer.from('%PDF-1.4 some fake data')).accepted,false));
test('rejects files exceeding max bytes',()=>assert.equal(inspectPdfForQuarantine(Buffer.alloc(MAX_PDF_BYTES+1)).accepted,false));
test('rejects nonbuffer',()=>assert.equal(inspectPdfForQuarantine('PDF').accepted,false));
test('editor can submit draft',()=>{
  const x=advanceReview(record(),{action:'submit',actor:'author',role:'editor',expectedVersion:0});
  assert.equal(x.state,'scanning'); assert.equal(x.version,1);
});
test('rejects stale transitions',()=>assert.throws(()=>advanceReview(record(),{action:'submit',actor:'author',role:'editor',expectedVersion:1}),/Stale/));
test('rejects unauthorized transition',()=>assert.throws(()=>advanceReview(record(),{action:'submit',actor:'author',role:'publisher',expectedVersion:0}),/Insufficient/));
test('cannot skip malware scan',()=>assert.throws(()=>advanceReview({...record(),state:'scanning'}, {action:'scan_clean',actor:'scanner',role:'scanner',expectedVersion:0}),/scan evidence/));
test('scan clean enters metadata review only with scanner evidence',()=>{
  const x=advanceReview({...record(),state:'scanning'},{action:'scan_clean',actor:'scanner',role:'scanner',expectedVersion:0,scanResult:'clean'});
  assert.equal(x.state,'metadata_review');
});
test('creator cannot self-review',()=>assert.throws(()=>advanceReview({...record(),state:'metadata_review',metadata_complete:true},{action:'metadata_accept',actor:'author',role:'reviewer',expectedVersion:0}),/Creator/));
test('privacy review requires reviewed public copy',()=>assert.throws(()=>advanceReview({...record(),state:'privacy_review'}, {action:'privacy_accept',actor:'reviewer2',role:'privacy_reviewer',expectedVersion:0}),/Reviewed public copy/));
test('cannot approve without explicit content and privacy approval',()=>assert.throws(()=>advanceReview({...record(),state:'ready_for_approval'},{action:'approve',actor:'publisher1',role:'publisher',expectedVersion:0}),/Content and privacy/));
test('cannot publish via state machine',()=>assert.throws(()=>advanceReview({...record(),state:'approved'},{action:'publish',actor:'publisher1',role:'publisher',expectedVersion:0}),/Invalid state/));
