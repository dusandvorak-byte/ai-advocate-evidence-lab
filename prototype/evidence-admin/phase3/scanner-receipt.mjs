import { createHmac, timingSafeEqual } from 'node:crypto';

// Adapter accepts signed scanner receipts only from a separately trusted scanner.
// In production, use asymmetric signatures / KMS-managed key rotation and durable nonce ledger.
const message = r => [r.id,r.intakeId,r.objectKey,r.objectSha256,r.verdict,r.issuedAt,r.expiresAt].join('\n');
export function createScannerHmacVerifier({key,nowSeconds=()=>Math.floor(Date.now()/1000)}={}) {
  if(!Buffer.isBuffer(key)||key.length<32) throw new Error('Scanner trust key required');
  return async receipt => {
    if(!receipt||typeof receipt!=='object'||typeof receipt.id!=='string'||
       !/^[0-9a-f-]{36}$/.test(receipt.intakeId||'')||
       !/^quarantine\/[0-9a-f-]{36}$/.test(receipt.objectKey||'')||
       !/^[a-f0-9]{64}$/.test(receipt.objectSha256||'')||
       !['clean','malicious'].includes(receipt.verdict)||
       !Number.isSafeInteger(receipt.issuedAt)||!Number.isSafeInteger(receipt.expiresAt)||
       receipt.issuedAt>nowSeconds()+30||receipt.expiresAt<=nowSeconds()||
       receipt.expiresAt-receipt.issuedAt>300||
       !/^[a-f0-9]{64}$/.test(receipt.receiptSha256||'')) return false;
    const expected=createHmac('sha256',key).update(message(receipt)).digest();
    return timingSafeEqual(expected,Buffer.from(receipt.receiptSha256,'hex'));
  };
}
// Test factory only. No production secret is bundled in this repository.
export function signSyntheticScannerReceipt(receipt,key) {
  if(!Buffer.isBuffer(key)||key.length<32) throw new Error('Synthetic key required');
  return {...receipt,receiptSha256:createHmac('sha256',key).update(message(receipt)).digest('hex')};
}
