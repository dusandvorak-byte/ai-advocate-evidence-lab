import {readFile,writeFile} from 'node:fs/promises';
const files=['web/index.html','web/en.html','web/kc/index.html','web/kc/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
const first=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-11-02-late-october.json','utf8')).documents;
const second=JSON.parse(await readFile('project-memory/documents-2026-supplement-2026-10-30-kasace-msp.json','utf8')).documents;
const docs=[...first,...second];
for(const file of files){
 const en=file.includes('/en.html')||file.includes('/news/');
 const heading=en?'Original PDF documents — October and November 2026':'Původní PDF dokumenty — říjen a listopad 2026';
 const rows=docs.map(d=>'<li data-doc="'+d.id+'"><a href="/ai-advocate-evidence-lab/'+d.public.pdf+'">'+d.issue_date+' — '+d.reference+'</a></li>').join('');
 const mark='<aside id="originals-november-2026"><h2>'+heading+'</h2><ul>'+rows+'</ul></aside>';
 let html=await readFile(file,'utf8');
 const start=html.indexOf('<aside id="originals-november-2026">');
 if(start>=0){const end=html.indexOf('</aside>',start);if(end<0)throw Error('broken prior originals panel');html=html.slice(0,start)+html.slice(end+8);}
 if(!html.includes('</main>'))throw Error('missing main in '+file);
 html=html.replace('</main>',mark+'</main>');
 for(const doc of docs)if(!html.includes(doc.public.pdf))throw Error('missing PDF from '+file);
 await writeFile(file,html,'utf8');
}
