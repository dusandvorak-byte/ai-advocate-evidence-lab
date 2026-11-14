// Editorial art placement preview. No images are shipped: origin bytes and
// rights/approval are pending. Never silently substitute fabricated artwork.
const isEnglish = document.documentElement.lang === 'en';
const I=(cz,en)=>isEnglish?en:cz;
const sources=[
 {key:'botanical',name:'Konopí.jpeg',dimensions:'720 × 450',group:'flora',
  title:I('Rostlina jako téma, ne jako dekorace','A plant as subject, not decoration'),
  note:I('Botanický vstup k tématu. Originální fotografie teprve čeká na bezpečné předání.','Botanical thematic opener. The original photo has not yet been supplied safely.')},
 {key:'police',name:'Policie.jpeg',dimensions:'720 × 810',group:'portrait',
  title:I('Dokumentace zásahů','Documenting interventions'),
  note:I('Kontextová fotografie. Sama o sobě nedokládá žádný konkrétní případ.','Contextual photography. The image alone does not prove any specific case.')},
 {key:'heart',name:'Srdce.jpeg',dimensions:'310 × 193',group:'heart',
  title:I('Státu lásky čas','State, It’s Time for Love'),
  note:I('Samostatný výtvarný motiv. Není ověřená ani dodaná publikační licence.','A standalone artistic motif. Publication rights have not been confirmed.')},
 {key:'poster',name:'Verze 17.11.2026…jpeg',dimensions:'1086 × 1448',group:'poster',
  title:I('Novodobí normalizátoři — satira','Modern-day Normalizers — satire'),
  note:I('Celý plakát bez ořezu. Politická satira, nikoli ověřené skutkové tvrzení.','Entire uncropped poster. Political satire, not a verified factual claim.')},
 {key:'advocacy',name:'war is over.jpeg',dimensions:'720 × 511',group:'campaign',
  title:'Cannabis War Is Over!',
  note:I('Advokační grafika, oddělená od dokazování a právních dokumentů.','Advocacy graphic, separate from legal evidence and verified records.')}
];
const target=document.querySelector('#editorial-art-grid');
if(target){
 for(const item of sources){
  const card=document.createElement('article');card.className='art-story art-story--'+item.group;
  const figure=document.createElement('figure');figure.className='art-figure';
  const panel=document.createElement('div');panel.className='art-placeholder';
  panel.setAttribute('role','img');
  panel.setAttribute('aria-label',I('Místo vyhrazené pro schválený originál: ','Reserved space for the approved original: ')+item.name);
  const lines=document.createElement('div');lines.className='art-placeholder-lines';lines.setAttribute('aria-hidden','true');
  const one=document.createElement('span'),two=document.createElement('span');
  lines.append(one,two);panel.append(lines);
  const pending=document.createElement('span');pending.className='art-pending';
  pending.textContent=I('ORIGINÁL ZATÍM NENÍ DODÁN','ORIGINAL FILE NOT YET PROVIDED');panel.append(pending);
  figure.append(panel);
  const cap=document.createElement('figcaption');
  const title=document.createElement('h3');title.textContent=item.title;
  const note=document.createElement('p');note.textContent=item.note;
  const meta=document.createElement('small');meta.textContent=item.name+' · '+item.dimensions;
  cap.append(title,note,meta);figure.append(cap);
  card.append(figure);target.append(card);
 }
}
