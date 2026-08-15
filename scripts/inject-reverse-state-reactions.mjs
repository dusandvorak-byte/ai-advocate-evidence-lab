import { readFile, writeFile } from 'node:fs/promises';
const registry=JSON.parse(await readFile('project-memory/documents-2026.json','utf8'));
let article=await readFile('web/zpravy/04082026-010.html','utf8');
const docs=new Map((registry.documents||[]).map(d=>[d.id,d]));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const pub=v=>String(v||'').replace(/^\.\//,'').replace(/^\/+/, '').replace(/^web\//,'');
const date=v=>{const [y,m,d]=String(v||'').split('-');return y&&m&&d?`${Number(d)}. ${Number(m)}. ${y}`:'datum neuvedeno'};
let inserted=0;
for(const state of registry.documents||[]){
 if(state.submission_side!=='incoming_from_state_or_public_institution'&&state.document_type!=='state_record')continue;
 for(const rel of state.relations||[]){
  if((rel.type||rel.relation_type)!=='reakce_na')continue;
  const target=docs.get(rel.target_id||rel.document_id);if(target?.submission_side!=='outgoing_from_user_or_alliance')continue;
  const marker=`data-reverse-reaction="${esc(state.id)}--${esc(target.id)}"`;if(article.includes(marker))continue;
  const pdf=target.public?.pdf?pub(target.public.pdf):null, html=target.public?.html?pub(target.public.html):`listiny/${target.id}.html`, href=pdf||html;
  const snippet=`<span class="chronology-reaction reverse-state-reaction" ${marker}> · <b>Naše podání, na které orgán reaguje ${esc(date(target.issue_date))}:</b> ${esc(target.user_title||target.title||target.id)} · <a href="${esc(href)}"${pdf?' target="_blank" rel="noopener"':''}>${pdf?'naše podání PDF':'stránka našeho podání'}</a></span>`;
  const start=article.indexOf(`<li id="${state.id}"`), end=start<0?-1:article.indexOf('</li>',start);if(start<0||end<0)throw new Error(`V Godotovi chybí položka ${state.id}`);
  article=article.slice(0,end)+snippet+article.slice(end);inserted++;
 }
}
await writeFile('web/zpravy/04082026-010.html',article,'utf8');
console.log(`Godot: doplněno ${inserted} opačných vazeb stát → naše podání.`);
