import { createPublicKey, verify as verifySignature } from 'node:crypto';

// OIDC verifier contract: JWKS comes from an independently authenticated HTTPS
// issuer discovery/cache. Nothing in this module fetches keys or trusts token claims
// before signature verification. No fallback to 'none', HS256 or supplied JWK.
const b64url = (v) => {
  if(typeof v!=='string' || !/^[A-Za-z0-9_-]+$/.test(v) || v.length>16000)
    throw new Error('Invalid JWS encoding');
  return Buffer.from(v,'base64url');
};
function parse(segment) {
  try {return JSON.parse(b64url(segment).toString('utf8'));}
  catch {throw new Error('Malformed JWS JSON');}
}
export async function verifyOidcJwt(token,{issuer,audience,jwks,nowSeconds=Math.floor(Date.now()/1000)}={}) {
  if(typeof token!=='string' || token.length>24000 || !issuer?.startsWith('https://') ||
     typeof audience!=='string' || !audience || !jwks || !Array.isArray(jwks.keys))
    throw new Error('OIDC verifier not configured');
  const parts=token.split('.');
  if(parts.length!==3) throw new Error('Malformed compact JWS');
  const [protectedHeader,payload,sig]=parts;
  const header=parse(protectedHeader);
  if(header.alg!=='RS256' || header.typ!=='JWT' || typeof header.kid!=='string' || !header.kid ||
     header.crit!==undefined || header.jku!==undefined || header.jwk!==undefined ||
     header.x5u!==undefined) throw new Error('Untrusted JWS header');
  const matching=jwks.keys.filter(k=>k.kid===header.kid && k.kty==='RSA' &&
    (k.use===undefined||k.use==='sig') &&
    (k.alg===undefined||k.alg==='RS256') &&
    (k.key_ops===undefined||Array.isArray(k.key_ops)&&k.key_ops.includes('verify')));
  if(matching.length!==1) throw new Error('Unknown or ambiguous OIDC signing key');
  let valid=false;
  try {
    valid=verifySignature('RSA-SHA256',Buffer.from(protectedHeader+'.'+payload),
      createPublicKey({key:matching[0],format:'jwk'}),b64url(sig));
  } catch {throw new Error('Invalid OIDC signature');}
  if(!valid) throw new Error('Invalid OIDC signature');
  const claims=parse(payload);
  if(!claims || typeof claims!=='object' || claims.iss!==issuer ||
     !(claims.aud===audience||Array.isArray(claims.aud)&&claims.aud.includes(audience)) ||
     typeof claims.sub!=='string'||!claims.sub ||
     !Number.isSafeInteger(claims.exp)||claims.exp<=nowSeconds ||
     !Number.isSafeInteger(claims.iat)||claims.iat>nowSeconds+30 ||
     (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>nowSeconds)))
    throw new Error('Invalid OIDC claims');
  return claims;
}
