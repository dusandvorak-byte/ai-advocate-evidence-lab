// Phase 3 identity boundary. Requires an externally audited OIDC JWT verifier; this module
// NEVER parses an unverified JWT, trusts bearer-supplied roles, or creates a default identity.
const allowedRoles = new Set(['editor','reviewer','privacy_reviewer','publisher','viewer','scanner']);
export function requireRole(identity, role) {
  if (!identity || typeof identity.actor !== 'string' || !identity.actor ||
      !Array.isArray(identity.roles) || !identity.roles.includes(role)) throw new Error('Forbidden');
  return identity.actor;
}
export async function authenticateOidc({ authorization, verifyJwt, lookupRoles,
  issuer, audience, nowSeconds=Math.floor(Date.now()/1000), acceptedMfaAcr=[] }) {
  if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
    throw new Error('Authentication required');
  if (typeof verifyJwt !== 'function' || typeof lookupRoles !== 'function' ||
      !issuer?.startsWith('https://') || !audience || !Array.isArray(acceptedMfaAcr))
    throw new Error('OIDC trust boundary not configured');
  // The injected verifier MUST validate JWKS signatures, algorithms, key rotation and issuer/audience.
  const claims = await verifyJwt(authorization.slice(7), {issuer,audience});
  if (!claims || claims.iss !== issuer || !claims.sub || typeof claims.sub !== 'string' ||
      !(claims.aud === audience || Array.isArray(claims.aud) && claims.aud.includes(audience)) ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds ||
      !Number.isSafeInteger(claims.iat) || claims.iat > nowSeconds + 30 ||
      (claims.nbf !== undefined && claims.nbf > nowSeconds))
    throw new Error('Invalid verified identity claims');
  if (!(Array.isArray(claims.amr) && claims.amr.includes('mfa')) &&
      !acceptedMfaAcr.includes(claims.acr)) throw new Error('MFA required');
  const actor = issuer + '|' + claims.sub;
  const roles = await lookupRoles(actor);
  if (!Array.isArray(roles) || roles.some(role=>!allowedRoles.has(role)) || new Set(roles).size!==roles.length)
    throw new Error('Invalid server-side role assignment');
  return Object.freeze({actor, roles:Object.freeze([...roles])});
}
