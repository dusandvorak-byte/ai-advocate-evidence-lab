/**
 * Boundary contract for a future separately approved read-only public registry.
 * It performs no I/O and intentionally does not connect to the current site.
 * The public status and fields MUST be derived by an independently reviewed
 * release/export pipeline, not from user-supplied metadata or this UI.
 */
const allowedKinds = new Set(['Usnesení','Podání','Příloha','Protokol','Zpráva','Rozhodnutí','Sdělení']);
const allowedStatuses = new Set(['published']);
const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;
const checksum=/^[a-f0-9]{64}$/;
export function validatePublicRegistryEntry(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Invalid registry entry');
  const {id,title,institution,kind,issuedAt,publicStatus,publicUrl,publicSha256,privacyReviewed,releaseApproved}=raw;
  if(typeof id!=='string' || !idPattern.test(id) || typeof title!=='string' || title.length<1 || title.length>240 ||
     typeof institution!=='string' || institution.length<1 || institution.length>160 ||
     !allowedKinds.has(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(issuedAt) ||
     Number.isNaN(Date.parse(issuedAt+'T00:00:00Z')) ||
     new Date(issuedAt+'T00:00:00Z').toISOString().slice(0,10)!==issuedAt ||
     !allowedStatuses.has(publicStatus) || privacyReviewed!==true || releaseApproved!==true ||
     typeof publicUrl!=='string' || !publicUrl.startsWith('/') ||
     publicUrl.startsWith('//') || publicUrl.includes('\\') ||
     /[%?#]|(^|\/)\.\.?(\/|$)/.test(publicUrl) ||
     !publicUrl.toLowerCase().endsWith('.pdf') || !checksum.test(publicSha256))
     throw new Error('Record not eligible for public display');
  return Object.freeze({
    id,title,institution,kind,issuedAt,
    status:'published',
    publicUrl,publicSha256
  });
}
export function normalizePublicRegistry(records){
  if(!Array.isArray(records) || records.length>10000)throw new Error('Invalid public export');
  const ids=new Set();
  return Object.freeze(records.map(entry=>{
    const v=validatePublicRegistryEntry(entry);
    if(ids.has(v.id))throw new Error('Duplicate record ID');
    ids.add(v.id);
    return v;
  }));
}
