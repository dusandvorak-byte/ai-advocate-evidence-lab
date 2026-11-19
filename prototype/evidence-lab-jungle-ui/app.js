// Self-contained design preview. All records are fictional placeholders.
// Never import a legal original, private registry or publication API here.
const samples = Object.freeze([
 {id:'DEMO-001',title:'Ukázkové usnesení – vzorový záznam',institution:'Modelový soud',date:'2026-10-28',status:'published',kind:'Usnesení',description:'Fiktivní položka ilustrující publikovanou veřejnou kopii. Nepopisuje skutečné soudní řízení.'},
 {id:'DEMO-002',title:'Demonstrační podání – revize',institution:'Modelový úřad',date:'2026-10-24',status:'review',kind:'Podání',description:'Fiktivní položka ve fázi kontroly. Tlačítka nezpřístupňují žádný skutečný dokument.'},
 {id:'DEMO-003',title:'Ukázková příloha – kontrola redakce',institution:'Zkušební instituce',date:'2026-10-18',status:'redacted',kind:'Příloha',description:'Syntetický scénář ochrany soukromí. Zdroj ani veřejná PDF kopie nejsou připojeny.'},
 {id:'DEMO-004',title:'Modelový protokol – veřejná kopie',institution:'Testovací instituce',date:'2026-10-12',status:'published',kind:'Protokol',description:'Pouze demonstrační záznam pro kontrolu layoutu archivu a detailu.'},
 {id:'DEMO-005',title:'Ukázková zpráva – odborná revize',institution:'Modelový znalec',date:'2026-09-27',status:'review',kind:'Zpráva',description:'Fiktivní položka pro ukázku workflow bez zpracování soukromých dat.'}
]);
const english=document.documentElement.lang==='en';
const translations={
 'DEMO-001':{title:'Sample court order — fictional record',institution:'Model Court',kind:'Court order',description:'A fictional record illustrating a published public copy. It does not describe an actual court proceeding.'},
 'DEMO-002':{title:'Sample filing — review',institution:'Model Authority',kind:'Filing',description:'Fictional item under review. No real document is linked.'},
 'DEMO-003':{title:'Sample attachment — redaction review',institution:'Test Institution',kind:'Attachment',description:'Synthetic privacy protection scenario. No source or public PDF is attached.'},
 'DEMO-004':{title:'Sample protocol — public copy',institution:'Test Institution',kind:'Protocol',description:'Synthetic record for testing archive and detail layout.'},
 'DEMO-005':{title:'Sample report — expert review',institution:'Model Expert',kind:'Report',description:'Fictional workflow item with no private information.'}
};
const records=Object.freeze(english?samples.map(x=>Object.freeze({...x,...translations[x.id]})):samples);
const label=(cs,en)=>english?en:cs;
const $ = selector => document.querySelector(selector);
const statuses = Object.freeze({published:[label('Publikováno','Published'),'published'],review:['Review','review'],redacted:[label('Redakce','Redaction'),'redacted']});
const persistedTheme = (() => {try{return window.localStorage.getItem('evidence-preview-theme');}catch{return null;}})();
let theme = persistedTheme === 'dark' ? 'dark' : 'light';
function applyTheme(){
 document.documentElement.dataset.theme=theme;
 const btn=$('#theme-toggle'); btn.setAttribute('aria-pressed',String(theme==='dark'));
 btn.setAttribute('aria-label',theme==='light'?label('Přepnout na tmavý režim','Switch to dark theme'):label('Přepnout na světlý režim','Switch to light theme'));
 btn.querySelector('span').textContent=theme==='light'?'☀':'☾';
 btn.querySelector('.theme-copy').textContent=theme==='light'?label('Světlý','Light'):label('Tmavý','Dark');
}
function toggleTheme(){theme=theme==='light'?'dark':'light';applyTheme();try{window.localStorage.setItem('evidence-preview-theme',theme);}catch{}}
function text(tag,klass,content){const node=document.createElement(tag);if(klass)node.className=klass;node.textContent=content;return node;}
function statusChip(status){const [label,klass]=statuses[status]||['Neznámý stav','redacted'];return text('span','status '+klass,label);}
function date(value){return new Intl.DateTimeFormat(english?'en-GB':'cs-CZ',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}
function featuredCard(item){
 const card=text('article','featured','');
 card.append(statusChip(item.status),text('span','featured-id',item.id),text('h3','',item.title),text('p','',item.institution+' · '+date(item.date)));
 const a=text('a','',label('Prohlédnout ukázku →','View sample →'));a.href='#detail/'+encodeURIComponent(item.id);card.append(a);
 return card;
}
function renderFeatured(){const root=$('#featured-cards');root.replaceChildren(...records.slice(0,3).map(featuredCard));}
function renderArchive(){
 const q=$('#search').value.toLocaleLowerCase('cs').trim();
 const status=$('#status').value;
 const shown=records.filter(x=>(status==='all'||x.status===status) &&
   [x.id,x.title,x.institution,x.kind].some(v=>v.toLocaleLowerCase('cs').includes(q)));
 $('#archive-count').textContent=label('Zobrazeno '+shown.length+' z '+records.length+' demonstračních záznamů','Showing '+shown.length+' of '+records.length+' sample records');
 const root=$('#archive-list');root.replaceChildren();
 if(!shown.length){root.append(text('p','count',label('Žádné ukázkové záznamy neodpovídají filtrům.','No sample records match these filters.')));return;}
 for(const item of shown){
   const row=text('article','archive-row','');
   const info=document.createElement('div');info.append(text('strong','',item.title),text('small','',item.id+' · '+item.kind));
   const institution=text('span','row-institution',item.institution);
   const ref=text('span','row-ref',item.id);
   const when=text('time','',date(item.date));when.dateTime=item.date;
   const link=text('a','',label('Detail →','Details →'));link.href='#detail/'+encodeURIComponent(item.id);
   const badge=statusChip(item.status);
   const actions=document.createElement('div');actions.append(badge,' ',link);
   row.append(info,institution,ref,when,actions);root.append(row);
 }
}
function renderDetail(id){
 const item=records.find(x=>x.id===id);
 if(!item)return false;
 $('#detail-title').textContent=item.title;
 $('#detail-subtitle').textContent='Záznam '+item.id+' · '+item.institution;
 $('#detail-desc').textContent=item.description;
 $('#detail-badge').replaceWith(Object.assign(statusChip(item.status),{id:'detail-badge'}));
 const rows=[[label('Reference','Reference'),item.id],[label('Instituce','Institution'),item.institution],[label('Typ','Type'),item.kind],[label('Datum','Date'),date(item.date)],[label('Stav','Status'),statuses[item.status][0]],['SHA-256',label('Není k dispozici (demo)','Not available (demo)')],[label('Zdrojové PDF','Source PDF'),label('Není připojeno','Not attached')]];
 $('#detail-meta').replaceChildren(...rows.flatMap(([name,value])=>[text('dt','',name),text('dd','',value)]));
 return true;
}
function navigate(){
 let hash='';
 try {hash=decodeURIComponent(location.hash.slice(1));}
 catch {hash='prehled';}
 const [section,arg]=hash.split('/');
 let page=section==='dokumenty'||section==='workflow'||section==='detail'?section:'prehled';
 if(page==='detail'&&!renderDetail(arg))page='dokumenty';
 for(const name of ['prehled','dokumenty','detail','workflow'])$('#page-'+name).hidden=page!==name;
 for(const nav of document.querySelectorAll('[data-nav]')){
   const active=nav.dataset.nav===page||(page==='detail'&&nav.dataset.nav==='dokumenty');
   if(active)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');
 }
 document.title=(page==='detail'?$('#detail-title').textContent:
  page==='dokumenty'?label('Seznam dokumentů','Document archive'):page==='workflow'?'Workflow':label('Přehled','Overview'))+' · Evidence Lab (demo)';
 if(page==='dokumenty')renderArchive();
 window.scrollTo({top:0,behavior:'instant'});
}
function setup(){
 applyTheme();renderFeatured();
 $('#metric-total').textContent=records.length;
 $('#metric-public').textContent=records.filter(x=>x.status==='published').length;
 $('#metric-review').textContent=records.filter(x=>x.status==='review').length;
 $('#theme-toggle').addEventListener('click',toggleTheme);
 const params=new URLSearchParams(location.search);
 const query=params.get('q');
 if(query)$('#search').value=query.slice(0,120);
 const selected=params.get('status');
 if(['all','published','review','redacted'].includes(selected))$('#status').value=selected;
 const lang=$('#language-switch');
 if(lang)lang.addEventListener('click',()=>{
   const dest=new URL(english?'./index.html':'./en.html',location.href);
   const q=$('#search').value.trim().slice(0,120),status=$('#status').value;
   if(q)dest.searchParams.set('q',q);
   if(status!=='all')dest.searchParams.set('status',status);
   dest.hash=location.hash;
   lang.href=dest.href;
 });
 $('#search').addEventListener('input',renderArchive);
 $('#status').addEventListener('change',renderArchive);
 $('#filters').addEventListener('reset',()=>queueMicrotask(renderArchive));
 $('#filters').addEventListener('submit',event=>{event.preventDefault();renderArchive();});
 window.addEventListener('hashchange',navigate);
 navigate();
}
if(typeof document!=='undefined')setup();
