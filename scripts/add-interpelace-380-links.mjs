import {readFile,writeFile} from 'node:fs/promises';
const targets=['web/index.html','web/en.html','web/kc/index.html','web/kc/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
for(const path of targets){
 const english=path.includes('/en.html')||path.includes('/news/');
 const target=english?'2018-interpellation-380-en.html':'2018-interpelace-380.html';
 const label=english?'Historical evidence — interpellation no. 380 (2018)':'Historický důkaz — interpelace č. 380 (2018)';
 const aside='<aside id="historical-interpellation-380"><h2>'+label+'</h2><p><a href="/ai-advocate-evidence-lab/listiny/'+target+'">'+(english?'Original parliamentary question and Government reply':'Původní interpelace a odpověď předsedy vlády')+'</a></p></aside>';
 let html=await readFile(path,'utf8');
 const start=html.indexOf('<aside id="historical-interpellation-380">');
 if(start>=0){const end=html.indexOf('</aside>',start);if(end<0)throw Error('Historical aside not closed '+path);html=html.slice(0,start)+html.slice(end+8);}
 if(!html.includes('</main>'))throw Error('Main missing '+path);
 html=html.replace('</main>',aside+'</main>');
 await writeFile(path,html,'utf8');
}
