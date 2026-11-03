import { createHash, randomUUID } from 'node:crypto';
import { inspectPdfForQuarantine } from '../backend/pdf-gate.mjs';

// S3-compatible storage contract is injected, never instantiated with live credentials.
// Expected client methods: putPrivateObject, deletePrivateObject (both scoped to private bucket).
const marker=Buffer.from('\n%EVIDENCE-LAB-TEST-ONLY\n');
export function createPrivateQuarantine({client,bucket,kmsKeyRef}) {
  if (!client || typeof client.putPrivateObject!=='function' ||
      typeof client.deletePrivateObject!=='function' ||
      !bucket || !kmsKeyRef) throw new Error('Private storage contract not configured');
  async function putSynthetic(bytes) {
    if(!Buffer.isBuffer(bytes)||!bytes.includes(marker)) throw new Error('Synthetic PDF required');
    const check=inspectPdfForQuarantine(bytes);
    if(!check.accepted) throw new Error('Invalid PDF pre-quarantine gate');
    const key='quarantine/'+randomUUID();
    // Encryption and zero-public-ACL MUST be enforced by the underlying bucket policy too.
    const receipt=await client.putPrivateObject({
      bucket,key,bytes,contentType:'application/pdf',
      acl:'private',sse:'aws:kms',kmsKeyRef,
      metadata:{sha256:check.sha256,classification:'synthetic-quarantine'}
    });
    if (!receipt || receipt.accepted!==true) throw new Error('Storage did not confirm receipt');
    return Object.freeze({key,sha256:check.sha256,size:bytes.length});
  }
  async function removeOrphan(key) {
    if(!/^quarantine\/[0-9a-f-]{36}$/.test(key)) throw new Error('Invalid quarantine key');
    return client.deletePrivateObject({bucket,key});
  }
  return Object.freeze({putSynthetic,removeOrphan});
}
// Scanner receives only quarantined object references; the service MUST return a
// cryptographically verified receipt from an independently trusted scanner adapter.
export function createScannerBoundary({scanner,verifyReceipt}) {
  if(typeof scanner?.scanPrivateObject!=='function'||typeof verifyReceipt!=='function')
    throw new Error('Trusted scanner integration required');
  return Object.freeze({
    async inspect({intakeId,objectKey,sha256}) {
      if(!/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/.test(intakeId)||
          !/^quarantine\/[0-9a-f-]{36}$/.test(objectKey)||
          !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid scan target');
      const receipt=await scanner.scanPrivateObject({intakeId,objectKey,sha256});
      if(!receipt||!(await verifyReceipt(receipt))||
          receipt.intakeId!==intakeId||receipt.objectSha256!==sha256||
          !['clean','malicious','error'].includes(receipt.verdict)||
          typeof receipt.id!=='string' || !receipt.id ||
          !/^[a-f0-9]{64}$/.test(receipt.receiptSha256))
        throw new Error('Untrusted scanner receipt');
      return Object.freeze({...receipt,verified:true});
    }
  });
}
// Coordinates only synthetic documents; enforces fail-closed compensating cleanup.
export function createSyntheticIntakeService({repository,storage}) {
  if(!repository?.create||!storage?.putSynthetic||!storage?.removeOrphan)
    throw new Error('Missing repository or private storage');
  return Object.freeze({
    async submit({identity,title,reference,bytes}) {
      let stored;
      try {
        stored=await storage.putSynthetic(bytes);
        if(!stored || stored.sha256!==createHash('sha256').update(bytes).digest('hex'))
          throw new Error('Storage digest mismatch');
        return await repository.create({
          identity,title,reference,bytes,objectKey:stored.key
        });
      } catch (e) {
        if(stored?.key) {
          try { await storage.removeOrphan(stored.key); }
          catch { throw new AggregateError([e,new Error('Quarantine orphan cleanup failed: reconcile before proceeding')],'Quarantine reconciliation required'); }
        }
        throw e;
      }
    }
  });
}
