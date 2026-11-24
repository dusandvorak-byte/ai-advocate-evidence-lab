import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {collectDatedBatch,attachmentPanel,renderAttachmentSurface} from '../scripts/finalize-state-attachment-surfaces.mjs';
const manifest=JSON.parse(await readFile(new URL('../project-memory/approved-november-timeline-2026-11-24.json',import.meta.url),'utf8'));
test('all 45 owner dates, exact verified mappings and unchanged source dates',async()=>{
  const expected=[23,4,4,4,4,4,4,4,5,6,6,6,9,16,4,4,4,4,6,6,7,10,12,12,12,12,12,12,19,23,4,4,5,9,11,11,16,18,22,11,16,19,6,9,14].map(day=>'2026-11-'+String(day).padStart(2,'0'));
  assert.deepEqual(manifest.items.map(r=>r.item),Array.from({length:45},(_,i)=>i+1));
  assert.deepEqual(manifest.items.map(r=>r.timeline_date),expected);
  const rows=manifest.items.filter(r=>r.document_id);
  assert.deepEqual(rows.map(r=>r.item),[3,4,5,6,7,8]);
  assert.deepEqual(rows.map(r=>r.document_id),['doc-cz-pcr-krpt-2026-08-20-rr-ku-54-2021','doc-cz-pcr-krpt-2026-08-20-rr-ku-54-2021-priloha-1',...Array.from({length:4},(_,i)=>'doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-'+(i+2))]);
  const root=await mkdtemp(join(tmpdir(),'approved-timeline-'));
  try{
    await mkdir(join(root,'documents'));
    const docs=[];
    for(const row of rows){
      const bytes=Buffer.from('%PDF-1.4\nfixture '+row.item+'\n%%EOF\n');
      const pdf='documents/'+row.item+'.pdf';
      await writeFile(join(root,pdf),bytes);
      docs.push({id:row.document_id,issue_date:row.item<=4?'2026-08-20':'2026-11-04',user_title:'Fixture '+row.item,public:{pdf,sha256:createHash('sha256').update(bytes).digest('hex')}});
    }
    const before=JSON.stringify(docs);
    const dated=await collectDatedBatch(docs,manifest,root);
    assert.equal(JSON.stringify(docs),before);
    assert.equal(dated.length,6);
    for(const lang of ['cs','en']){
      const attachments=docs.slice(2);
      const html=attachmentPanel(attachments,lang,dated);
      assert.equal((html.match(/data-timeline-date="2026-11-04"/g)||[]).length,6);
      assert.equal((html.match(/data-attachment-id=/g)||[]).length,4);
      for(const row of dated)assert.equal(html.split('href="/ai-advocate-evidence-lab/'+row.document.public.pdf+'"').length,2);
      const shell='<main><p>fixture</p></main>';
      assert.equal(renderAttachmentSurface(renderAttachmentSurface(shell,attachments,'2026-11-03',lang,false,dated),attachments,'2026-11-03',lang,false,dated),renderAttachmentSurface(shell,attachments,'2026-11-03',lang,false,dated));
    }
    const bad=structuredClone(manifest);bad.items[0].document_id=docs[0].id;
    await assert.rejects(collectDatedBatch(docs,bad,root));
    await writeFile(join(root,docs[0].public.pdf),'tampered');
    await assert.rejects(collectDatedBatch(docs,manifest,root),/SHA mismatch/);
  }finally{await rm(root,{recursive:true,force:true})}
});
