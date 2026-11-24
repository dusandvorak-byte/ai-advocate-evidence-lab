import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEditorialIntake,validateEditorialCollection} from './editorial-intake.mjs';
const files=[
 ['botanical','Konopí.jpeg',720,450,'context'],
 ['police','Policie.jpeg',720,810,'context'],
 ['heart','Srdce.jpeg',310,193,'artwork'],
 ['poster','Verze 17.11.2026 Má heslo Konopná amnestie a ti, kdo k ní nejvíce přispěli -jpg (1).jpeg',1086,1448,'satire'],
 ['advocacy','war is over.jpeg',720,511,'advocacy']
];
// All data below are synthetic fixtures; they are not real image SHA or consent.
function sample([key,sourceFilename,width,height,role],i){
 return {key,sourceFilename,width,height,role,mime:'image/jpeg',
 sha256:String(i+1).repeat(64),credit:'FICTIONAL SAMPLE CREDIT',
 altCs:'Testovací český popis',altEn:'Test English description',
 captionCs:'Testovací český titulek',captionEn:'Test English caption',
 rightsReviewed:true,privacyReviewed:true,editorialReviewed:true,ownerReleaseApproved:true,
 approvalReference:'SYNTHETIC-APPROVAL-ONLY',fullFrameRequired:true};
}
test('all five synthetic fixtures meet exact expected identity and original ratio',()=>{
 const approved=validateEditorialCollection(files.map(sample));
 assert.equal(approved.length,5);
 assert.equal(approved.find(x=>x.key==='poster').width,1086);
 assert.ok(approved.every(Object.isFrozen));
});
test('no original image may appear without independent permissions and actual manifest fields',()=>{
 const approved=sample(files[0],0);
 for(const patch of [
 {rightsReviewed:false},{privacyReviewed:false},{editorialReviewed:false},
 {ownerReleaseApproved:false},{approvalReference:''},{sha256:'unknown'},
 {width:999},{sourceFilename:'replacement.jpg'},{mime:'image/png'},
 {altCs:''},{altEn:''},{credit:''},{url:'/assets/photo.jpeg'},
 {base64:'data:image/jpeg;base64,...'},{exif:{GPS:'not allowed'}}
 ])assert.throws(()=>validateEditorialIntake({...approved,...patch}),undefined,JSON.stringify(patch));
 assert.throws(()=>validateEditorialIntake({...sample(files[3],3),fullFrameRequired:false}),/full frame/);
 assert.throws(()=>validateEditorialCollection([approved]),/Exactly five/);
 assert.throws(()=>validateEditorialCollection([...files.map(sample).slice(0,4),sample(files[0],0)]),/Duplicate/);
});
test('validator returns allowlisted fields only, never internal approval boolean claims',()=>{
 const result=validateEditorialIntake({...sample(files[0],0),internalNotes:'private'});
 assert.equal(result.internalNotes,undefined);
 assert.equal(result.rightsReviewed,undefined);
 assert.equal(result.ownerReleaseApproved,undefined);
});
