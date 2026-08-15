(() => {
  const cssHref = 'home-rollups.css';
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = cssHref; document.head.append(link);
  }
  const today = new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'long',year:'numeric'}).format(new Date()).replace(/\.$/,'');
  const stateCount = Number(document.querySelector('[data-state-document-count]')?.textContent || 67);
  const brandSubtitle=document.querySelector('.masthead .brand span'); if(brandSubtitle) brandSubtitle.textContent='Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
  const sections=[
    {title:'Aktivní soudní řízení on-line od 1. května 2026',cls:'court',items:[['OS Prostějov sp. zn. 2 T 104/2010 – obnova','zpravy/04082026-010.html#case-cz-os-pro-2t104-2010-obnova'],['OS Prostějov – prevence 2026','zpravy/04082026-010.html#case-cz-os-pro-prevence-2026'],['OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize','zpravy/04082026-010.html#case-cz-os-praha4-10c69-2026'],['MS v Praze sp. zn. 18 A 17/2026 – NCOZ','zpravy/04082026-010.html#case-cz-ms-praha-18a17-2026'],['MS v Praze sp. zn. 18 A 23/2026 – MSp','zpravy/04082026-010.html#case-cz-ms-praha-18a23-2026'],['MS v Praze sp. zn. 8 Ad 9/2026 – MZ','zpravy/04082026-010.html#case-cz-ms-praha-8ad9-2026'],['MS v Praze sp. zn. 45 T 1/2024 – vratka VS','zpravy/04082026-010.html#case-cz-ms-praha-45t1-2024']]},
    {title:'Předžalobní řízení on-line od 1. května 2026',cls:'pretrial',items:[['OSZ Prostějov – prevence 2026','zpravy/04082026-010.html#case-cz-osz-pro-prevence-2026'],['Policie ČR – prevence Prostějov 2026','zpravy/04082026-010.html#case-cz-pcr-prevence-prostejov-2026'],['Policie ČR – interní přezkum KÚ','zpravy/04082026-010.html#case-cz-pcr-ku-interni-prezkum'],['NSZ – předžalobní výzva','zpravy/04082026-010.html#case-cz-nsz-predzalobni-vyzva'],['VSZ Praha – dohled MSZ','zpravy/04082026-010.html#case-cz-vsz-praha-dohled-msz'],['MSZ Praha – přezkumy','zpravy/04082026-010.html#case-cz-msz-praha-prezkumy'],['VSZ Olomouc – dohled KSZ Brno','zpravy/04082026-010.html#case-cz-vsz-olomouc-dohled-ksz-brno'],['KSZ Brno – přezkumy','zpravy/04082026-010.html#case-cz-ksz-brno-prezkumy'],['KPR – tři aktuální větve','zpravy/04082026-010.html#case-cz-kpr-tri-vetve']]},
    {title:'Státní láska online od 1. května 2026',cls:'state-love',items:[['Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?','zpravy/04082026-010.html#chronologie'],['Policie ČR – sdělení, rozhodnutí a opravné prostředky','zpravy/04082026-010.html#instituce-policie'],['Státní zastupitelství – sdělení, rozhodnutí a opravné prostředky','zpravy/04082026-010.html#instituce-statni-zastupitelstvi'],['Kancelář prezidenta republiky – tři větve řízení','zpravy/04082026-010.html#instituce-kpr'],['Ministerstva – vnitra, spravedlnosti, zdravotnictví a kultury','zpravy/04082026-010.html#instituce-ministerstva']]}
  ];
  const makeSummary=(left,middle='',directHref='')=>`<span class="rollup-title">${left}</span><span class="rollup-prompt">${middle}</span><span class="rollup-heart">❤️</span>${directHref?`<a class="rollup-direct" href="${directHref}" aria-label="Otevřít přímo">Číst →</a>`:'<b>Rozbalit →</b>'}`;
  document.addEventListener('click',e=>{const a=e.target.closest('.rollup-direct');if(a)e.stopPropagation();});
  const mount=document.querySelector('.edition-bar'); let wrapper=document.getElementById('live-dockets');
  if(wrapper) wrapper.remove();
  if(mount){wrapper=document.createElement('section');wrapper.id='live-dockets';wrapper.className='live-dockets';for(const s of sections){const d=document.createElement('details');d.className=`live-docket-bar ${s.cls} home-rollup`;const sum=document.createElement('summary');sum.innerHTML=makeSummary(s.title,'číst jako investigativu s láskou →');const grid=document.createElement('div');grid.className='live-docket-links';for(const [label,href] of s.items){const a=document.createElement('a');a.href=href;a.textContent=label;grid.append(a)}d.append(sum,grid);wrapper.append(d)}mount.insertAdjacentElement('afterend',wrapper)}
  const latest=document.getElementById('latest-records'); if(latest && latest.tagName!=='DETAILS'){const grid=latest.querySelector('.latest-record-grid');const d=document.createElement('details');d.id='latest-records';d.className='latest-records latest-records-dropdown home-rollup home-rollup-heavy';const sum=document.createElement('summary');sum.innerHTML=makeSummary(`Státu lásky čas do ${today} →`,'poslední tři polibky státu →');if(grid)d.append(sum,grid);else d.append(sum);latest.replaceWith(d)}
  const alert=document.querySelector('.newsroom-alert'); if(alert){const d=document.createElement('details');d.className='home-rollup home-rollup-heavy godot-rollup';const sum=document.createElement('summary');sum.innerHTML=makeSummary(`Státu lásky čas od 1. května 2026 do ${today} znamená celkem ${stateCount} vášnivých polibků státních orgánů při čekání na Godota →`,'','zpravy/04082026-010.html#chronologie');d.append(sum);alert.replaceWith(d)}
  const lead=document.querySelector('.lead-card');
  if(lead && !lead.closest('.lead-rollup')){
    const d=document.createElement('details'); d.className='home-rollup home-rollup-heavy lead-rollup';
    const sum=document.createElement('summary'); sum.innerHTML=makeSummary('ZPRÁVA DNE · CANNAINSIDER.EU NEWS · 7. 8. 2026 · EVROPSKÁ VĚTEV · REPORT 07082026-011 →','','zpravy/07082026-011.html');
    const parent=lead.parentNode; parent.insertBefore(d,lead); d.append(sum,lead);
  } else if(lead){
    const summary=lead.closest('.lead-rollup')?.querySelector('summary');
    if(summary) summary.innerHTML=makeSummary('ZPRÁVA DNE · CANNAINSIDER.EU NEWS · 7. 8. 2026 · EVROPSKÁ VĚTEV · REPORT 07082026-011 →','','zpravy/07082026-011.html');
  }
})();
