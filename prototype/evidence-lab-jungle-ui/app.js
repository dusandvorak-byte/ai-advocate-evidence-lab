// Self-contained design preview. All records are fictional placeholders.
// Never import a legal original, private registry or publication API here.
const samples = Object.freeze([
 {id:'DEMO-001',title:'Ukázkové usnesení – vzorový záznam',institution:'Modelový soud',date:'2026-10-28',status:'published',kind:'Usnesení',description:'Fiktivní položka ilustrující publikovanou veřejnou kopii. Nepopisuje skutečné soudní řízení.'},
 {id:'DEMO-002',title:'Demonstrační podání – revize',institution:'Modelový úřad',date:'2026-10-24',status:'review',kind:'Podání',description:'Fiktivní položka ve fázi kontroly. Tlačítka nezpřístupňují žádný skutečný dokument.'},
 {id:'DEMO-003',title:'Ukázková příloha – kontrola redakce',institution:'Zkušební instituce',date:'2026-10-18',status:'redacted',kind:'Příloha',description:'Syntetický scénář ochrany soukromí. Zdroj ani veřejná PDF kopie nejsou připojeny.'},
 {id:'DEMO-004',title:'Modelový protokol – veřejná kopie',institution:'Testovací instituce',date:'2026-10-12',status:'published',kind:'Protokol',description:'Pouze demonstrační záznam pro kontrolu layoutu archivu a detailu.'},
 {id:'DEMO-005',title:'Ukázková zpráva – odborná revize',institution:'Modelový znalec',date:'2026-09-27',status:'review',kind:'Zpráva',description:'Fiktivní položka pro ukázku workflow bez zpracování soukromých dat.'}
]);
const $ = selector => document.querySelector(selector);
const statuses = Object.freeze({published:['Publikováno','published'],review:['Review','review'],redacted:['Redakce','redacted']});
const persistedTheme = (() => {try{return window.localStorage.getItem('evidence-preview-theme');}catch{return null;}})();
let theme = persistedTheme === 'dark' ? 'dark' : 'light';
function applyTheme(){
 document.documentElement.dataset.theme=theme;
 const btn=$('#theme-toggle'); btn.setAttribute('aria-pressed',String(theme==='dark'));
 btn.setAttribute('aria-label',theme==='light'?'Přepnout na tmavý režim':'Přepnout na světlý režim');
 btn.querySelector('span').textContent=theme==='light'?'☀':'☾';
 btn.querySelector('.theme-copy').textContent=theme==='light'?'Světlý':'Tmavý';
}
function toggleTheme(){theme=theme==='light'?'dark':'light';applyTheme();try{window.localStorage.setItem('evidence-preview-theme',theme);}catch{}}
function text(tag,klass,content){const node=document.createElement(tag);if(klass)node.className=klass;node.textContent=content;return node;}
function statusChip(status){const [label,klass]=statuses[status]||['Neznámý stav','redacted'];return text('span','status '+klass,label);}
function date(value){return new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}
function featuredCard(item){
 const card=text('article','featured','');
 card.append(statusChip(item.status),text('span','featured-id',item.id),text('h3','',item.title),text('p','',item.institution+' · '+date(item.date)));
 const a=text('a','', 'Prohlédnout ukázku →');a.href='#detail/'+encodeURIComponent(item.id);card.append(a);
 return card;
}
function renderFeatured(){const root=$('#featured-cards');root.replaceChildren(...samples.slice(0,3).map(featuredCard));}
function renderArchive(){
 const q=$('#search').value.toLocaleLowerCase('cs').trim();
 const status=$('#status').value;
 const shown=samples.filter(x=>(status==='all'||x.status===status) &&
   [x.id,x.title,x.institution,x.kind].some(v=>v.toLocaleLowerCase('cs').includes(q)));
 $('#archive-count').textContent='Zobrazeno '+shown.length+' z '+samples.length+' demonstračních záznamů';
 const root=$('#archive-list');root.replaceChildren();
 if(!shown.length){root.append(text('p','count','Žádné ukázkové záznamy neodpovídají filtrům.'));return;}
 for(const item of shown){
   const row=text('article','archive-row','');
   const info=document.createElement('div');info.append(text('strong','',item.title),text('small','',item.id+' · '+item.kind));
   const institution=text('span','row-institution',item.institution);
   const ref=text('span','row-ref',item.id);
   const when=text('time','',date(item.date));when.dateTime=item.date;
   const link=text('a','', 'Detail →');link.href='#detail/'+encodeURIComponent(item.id);
   const badge=statusChip(item.status);
   const actions=document.createElement('div');actions.append(badge,' ',link);
   row.append(info,institution,ref,when,actions);root.append(row);
 }
}
function renderDetail(id){
 const item=samples.find(x=>x.id===id);
 if(!item)return false;
 $('#detail-title').textContent=item.title;
 $('#detail-subtitle').textContent='Záznam '+item.id+' · '+item.institution;
 $('#detail-desc').textContent=item.description;
 $('#detail-badge').replaceWith(Object.assign(statusChip(item.status),{id:'detail-badge'}));
 const rows=[['Reference',item.id],['Instituce',item.institution],['Typ',item.kind],['Datum',date(item.date)],['Stav',statuses[item.status][0]],['SHA-256','Není k dispozici (demo)'],['Zdrojové PDF','Není připojeno']];
 $('#detail-meta').replaceChildren(...rows.flatMap(([name,value])=>[text('dt','',name),text('dd','',value)]));
 return true;
}
function navigate(){
 const hash=decodeURIComponent(location.hash.slice(1));
 const [section,arg]=hash.split('/');
 let page=section==='dokumenty'||section==='workflow'||section==='detail'?section:'prehled';
 if(page==='detail'&&!renderDetail(arg))page='dokumenty';
 for(const name of ['prehled','dokumenty','detail','workflow'])$('#page-'+name).hidden=page!==name;
 for(const nav of document.querySelectorAll('[data-nav]')){
   const active=nav.dataset.nav===page||(page==='detail'&&nav.dataset.nav==='dokumenty');
   if(active)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');
 }
 document.title=(page==='detail'?$('#detail-title').textContent:
  page==='dokumenty'?'Seznam dokumentů':page==='workflow'?'Workflow':'Přehled')+' · Evidence Lab (demo)';
 if(page==='dokumenty')renderArchive();
 window.scrollTo({top:0,behavior:'instant'});
}
function setup(){
 applyTheme();renderFeatured();
 $('#metric-total').textContent=samples.length;
 $('#metric-public').textContent=samples.filter(x=>x.status==='published').length;
 $('#metric-review').textContent=samples.filter(x=>x.status==='review').length;
 $('#theme-toggle').addEventListener('click',toggleTheme);
 $('#search').addEventListener('input',renderArchive);
 $('#status').addEventListener('change',renderArchive);
 $('#filters').addEventListener('reset',()=>queueMicrotask(renderArchive));
 window.addEventListener('hashchange',navigate);
 navigate();
}
if(typeof document!=='undefined')setup();
