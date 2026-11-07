/**
 * Planning-only intake validator for original editorial images.
 * No file I/O and no right to publish is conferred by this manifest.
 * Real bytes, SHA and approvals must be independently verified by a trusted
 * editor before public use. Not imported into the current UI.
 */
const EXPECTED = Object.freeze({
 botanical:{name:'Konopí.jpeg',width:720,height:450,role:'context'},
 police:{name:'Policie.jpeg',width:720,height:810,role:'context'},
 heart:{name:'Srdce.jpeg',width:310,height:193,role:'artwork'},
 poster:{name:'Verze 17.11.2026 Má heslo Konopná amnestie a ti, kdo k ní nejvíce přispěli -jpg (1).jpeg',width:1086,height:1448,role:'satire'},
 advocacy:{name:'war is over.jpeg',width:720,height:511,role:'advocacy'}
});
const hex256=/^[a-f0-9]{64}$/;
const acceptedMime=new Set(['image/jpeg']);
const forbiddenKeys=new Set(['data','base64','url','publicUrl','content','exif','originalBytes']);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
export function validateEditorialIntake(entry){
 if(!entry || typeof entry!=='object' || Array.isArray(entry))throw Error('Missing media intake');
 for(const key of forbiddenKeys)if(own(entry,key))throw Error('Unexpected embedded media or URL');
 const ref=EXPECTED[entry.key];
 if(!ref || entry.sourceFilename!==ref.name || entry.width!==ref.width ||
    entry.height!==ref.height || entry.role!==ref.role ||
    !acceptedMime.has(entry.mime) || !hex256.test(entry.sha256||'') ||
    typeof entry.credit!=='string' || !entry.credit.trim() || entry.credit.length>250 ||
    typeof entry.altCs!=='string' || !entry.altCs.trim() ||
    typeof entry.altEn!=='string' || !entry.altEn.trim() ||
    typeof entry.captionCs!=='string' || !entry.captionCs.trim() ||
    typeof entry.captionEn!=='string' || !entry.captionEn.trim() ||
    entry.rightsReviewed!==true || entry.privacyReviewed!==true ||
    entry.editorialReviewed!==true || entry.ownerReleaseApproved!==true ||
    typeof entry.approvalReference!=='string' || !entry.approvalReference.trim()
 )throw Error('Editorial image not eligible for public delivery');
 if(entry.key==='poster' && entry.fullFrameRequired!==true)
   throw Error('Poster must preserve the original full frame');
 return Object.freeze({
   key:entry.key,sourceFilename:entry.sourceFilename,mime:entry.mime,
   width:entry.width,height:entry.height,sha256:entry.sha256,
   role:entry.role,credit:entry.credit,altCs:entry.altCs,altEn:entry.altEn,
   captionCs:entry.captionCs,captionEn:entry.captionEn,
   approvalReference:entry.approvalReference,fullFrameRequired:entry.key==='poster'
 });
}
export function validateEditorialCollection(entries){
 if(!Array.isArray(entries)||entries.length!==5)throw Error('Exactly five originals expected');
 const keys=new Set(),hashes=new Set();
 return Object.freeze(entries.map(item=>{
   const v=validateEditorialIntake(item);
   if(keys.has(v.key)||hashes.has(v.sha256))throw Error('Duplicate media identity');
   keys.add(v.key);hashes.add(v.sha256);return v;
 }));
}
