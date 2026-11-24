import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function releaseVersion(sha){
  if(!/^[0-9a-f]{40}$/.test(sha||''))throw Error('Cache version requires exact audited 40hex source SHA');
  return sha.slice(0,12);
}
// Match only known, local asset references. Preserve their relative/absolute
// path and all other attributes; never alter external URLs or document links.
const htmlRefs=/(src|href)="((?:\/ai-advocate-evidence-lab\/|(?:\.\.\/)*|\.\/)?)(live-dockets\.js|news-feed\.js|justice-slalom\.css)(?:\?v=([^"#]*))?"/g;
const cssRefs=/(const (?:cssHref|liveDocketsCssHref) = ')(home-rollups\.css|live-dockets\.css)(?:\?v=([^']*))?(')/g;
const htmlReplacement=(version)=>(_m,attr,prefix,asset)=>attr+'="'+prefix+asset+'?v='+version+'"';
export function versionHtml(html,sha){
  return html.replace(htmlRefs,htmlReplacement(releaseVersion(sha)));
}
export function versionDocketsJs(js,sha){
  const version=releaseVersion(sha);
  return js.replace(cssRefs,(_m,start,asset,_old,end)=>start+asset+'?v='+version+end);
}
export function verifyHtml(html,sha,{englishHome=false}={}){
  const version=releaseVersion(sha);
  const refs=[...html.matchAll(htmlRefs)];
  for(const [,attr,,asset,actual] of refs){
    const expectedAttr=asset.endsWith('.js')?'src':'href';
    if(attr!==expectedAttr||actual!==version)throw Error('Unversioned or wrong release cache reference: '+asset);
  }
  if(englishHome)for(const asset of ['live-dockets.js','news-feed.js']){
    const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)]
      .map(m=>m[1]).filter(url=>new RegExp('^(?:/ai-advocate-evidence-lab/|(?:\\.\\./)*|\\./)?'+asset.replace('.','\\.')+'(?:\\?|$)').test(url));
    if(scripts.length!==1||!scripts[0].endsWith('?v='+version))throw Error('Missing, duplicate or wrong-version English home script: '+asset);
  }
}
export function verifyDocketsJs(js,sha){
  const version=releaseVersion(sha);
  const refs=[...js.matchAll(cssRefs)];
  for(const [variable,asset] of [['cssHref','home-rollups.css'],['liveDocketsCssHref','live-dockets.css']]){
    const rows=refs.filter(m=>m[1]==="const "+variable+" = '");
    if(rows.length!==1||rows[0][2]!==asset||rows[0][3]!==version)throw Error('Missing or wrong-version docket stylesheet: '+asset);
  }
}
async function walk(root){
  const result=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    const p=join(root,entry.name);
    if(entry.isDirectory())result.push(...await walk(p));
    else if(entry.isFile()&&entry.name.endsWith('.html'))result.push(p);
  }
  return result;
}
export async function checkReleaseCacheTree(root,sha,{write=false}={}){
  releaseVersion(sha);
  for(const file of await walk(root)){
    const original=await readFile(file,'utf8');
    const final=write?versionHtml(original,sha):original;
    verifyHtml(final,sha,{englishHome:[join(root,'en.html'),join(root,'web','en.html')].includes(file)});
    if(write&&original!==final)await writeFile(file,final,'utf8');
  }
  for(const p of [root,join(root,'web')]){
    verifyHtml(await readFile(join(p,'en.html'),'utf8'),sha,{englishHome:true});
    const file=join(p,'live-dockets.js');
    const original=await readFile(file,'utf8');
    const final=write?versionDocketsJs(original,sha):original;
    verifyDocketsJs(final,sha);
    if(write&&original!==final)await writeFile(file,final,'utf8');
  }
  console.log('RELEASE_CACHE_VERSION_OK: exact audited source '+sha+'; root and mirrored EN scripts, local asset links and docket stylesheets verified');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [mode,root,sha]=process.argv.slice(2);
  if(!['--write','--verify'].includes(mode)||!root)throw Error('Usage: release-cache-version.mjs --write|--verify STAGED_ROOT EXACT_SOURCE_SHA');
  await checkReleaseCacheTree(root,sha,{write:mode==='--write'});
}
