import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign,randomUUID,createHash} from 'node:crypto';
import {verifyOidcJwt} from './oidc-jwks.mjs';
import {authenticateOidc} from './identity.mjs';
import {createScannerHmacVerifier,signSyntheticScannerReceipt} from './scanner-receipt.mjs';
import {createS3PrivateAdapter} from './s3-adapter.mjs';

const now=1800000000, issuer='https://oidc.example.test',audience='evidence-admin';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'synthetic-2026',use:'sig',alg:'RS256'};
function token(claimOverrides={},headerOverrides={}) {
  const header=Buffer.from(JSON.stringify({typ:'JWT',kid:jwk.kid,alg:'RS256',...headerOverrides})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({iss:issuer,aud:audience,sub:'editor',iat:now-10,
    exp:now+300,amr:['mfa'],...claimOverrides})).toString('base64url');
  const msg=header+'.'+payload;
  return msg+'.'+createSign('RSA-SHA256').update(msg).end().sign(privateKey).toString('base64url');
}
test('OIDC RS256 real signature and MFA + server directory roles',async()=>{
  const signed=token();
  const identity=await authenticateOidc({authorization:'Bearer '+signed,
    verifyJwt:(raw,options)=>verifyOidcJwt(raw,{...options,jwks:{keys:[jwk]},nowSeconds:now}),
    lookupRoles:async()=>['editor'],issuer,audience,nowSeconds:now});
  assert.deepEqual(identity.roles,['editor']);
  assert.equal(identity.actor,issuer+'|editor');
});
test('OIDC rejects alg none, forged payload, unrelated key, wrong audience and expired JWT',async()=>{
  const valid=token();
  await assert.rejects(verifyOidcJwt(token({}, {alg:'none'}),{issuer,audience,jwks:{keys:[jwk]},nowSeconds:now}),/Untrusted JWS header/);
  const [header,,sig]=valid.split('.');
  const forged=header+'.'+Buffer.from(JSON.stringify({iss:issuer,aud:audience,sub:'admin',iat:now-10,exp:now+300})).toString('base64url')+'.'+sig;
  await assert.rejects(verifyOidcJwt(forged,{issuer,audience,jwks:{keys:[jwk]},nowSeconds:now}),/Invalid OIDC signature/);
  await assert.rejects(verifyOidcJwt(valid,{issuer,audience,jwks:{keys:[]},nowSeconds:now}),/Unknown or ambiguous/);
  await assert.rejects(verifyOidcJwt(token({aud:'wrong'}),{issuer,audience,jwks:{keys:[jwk]},nowSeconds:now}),/Invalid OIDC claims/);
  await assert.rejects(verifyOidcJwt(token({exp:now-1}),{issuer,audience,jwks:{keys:[jwk]},nowSeconds:now}),/Invalid OIDC claims/);
});
test('trusted scanner MAC validates object and expiry and detects modified verdict',async()=>{
  const key=Buffer.alloc(32,7),id=randomUUID(), objectKey='quarantine/'+randomUUID();
  const receipt=signSyntheticScannerReceipt({id:'scan-1',intakeId:id,objectKey,
    objectSha256:createHash('sha256').update('synthetic').digest('hex'),
    verdict:'clean',issuedAt:now-15,expiresAt:now+100},key);
  const verify=createScannerHmacVerifier({key,nowSeconds:()=>now});
  assert.equal(await verify(receipt),true);
  assert.equal(await verify({...receipt,objectKey:'quarantine/'+randomUUID()}),false);
  assert.equal(await verify({...receipt,verdict:'malicious'}),false);
  assert.equal(await createScannerHmacVerifier({key,nowSeconds:()=>now+150})(receipt),false);
});
test('S3 adapter sends encryption-specific private command, never public ACL',async()=>{
  const seen=[];
  class PutObjectCommand{constructor(input){this.input=input;}}
  class DeleteObjectCommand{constructor(input){this.input=input;}}
  const adapter=createS3PrivateAdapter({s3:{send:async cmd=>(seen.push(cmd.input),{ETag:'synthetic-only'})},
    PutObjectCommand,DeleteObjectCommand});
  const key='quarantine/'+randomUUID();
  const bytes=Buffer.from('%PDF-1.4\n%EVIDENCE-LAB-TEST-ONLY\n%%EOF');
  await adapter.putPrivateObject({bucket:'private-synthetic',key,bytes,
    contentType:'application/pdf',acl:'private',sse:'aws:kms',kmsKeyRef:'synthetic-kms',
    metadata:{sha256:createHash('sha256').update(bytes).digest('hex'),classification:'synthetic-quarantine'}});
  assert.equal(seen[0].ServerSideEncryption,'aws:kms');
  assert.equal(seen[0].SSEKMSKeyId,'synthetic-kms');
  assert.equal(seen[0].ACL,undefined);
  await adapter.deletePrivateObject({bucket:'private-synthetic',key});
  await assert.rejects(adapter.deletePrivateObject({bucket:'private-synthetic',key:'../public'}),
    /Unsafe S3 delete/);
});
