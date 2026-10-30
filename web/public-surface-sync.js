(() => {
  const isEn=document.documentElement.lang==='en';
  const isChurch=document.body.classList.contains('church-site');
  const count=67;
  const dateCs='15. srpna 2026', dateEn='15 August 2026';
  document.querySelectorAll('.topline>span:first-child').forEach(n=>n.textContent=isEn?'15 AUGUST 2026':'15. SRPNA 2026');
  document.body.dataset.canonicalStateCount=String(count);
  const alert=document.querySelector('.newsroom-alert');
  if(alert){alert.querySelectorAll('span').forEach(n=>n.textContent=n.textContent.replace(/64/g,String(count)).replace(/12 August 2026/g,dateEn).replace(/12\. srpna 2026/g,dateCs));}
  if(!document.querySelector('link[href="home-rollups.css"]')){const l=document.createElement('link');l.rel='stylesheet';l.href='home-rollups.css';document.head.append(l)}
  const mk=(title,prompt,body,heavy=false)=>{const d=document.createElement('details');d.className='home-rollup'+(heavy?' home-rollup-heavy':'');const s=document.createElement('summary');s.innerHTML=`<span class="rollup-title">${title}</span><span class="rollup-prompt">${prompt}</span><span class="rollup-heart">❤️</span><b>${isEn?'Expand →':'Rozbalit →'}</b>`;d.append(s,body);return d};
  const main=document.querySelector('main'); if(!main||document.getElementById('surface-sync-rollups'))return;
  const box=document.createElement('section');box.id='surface-sync-rollups';box.className='live-dockets';
  const rows=isEn?[
    ['Active court proceedings online since 1 May 2026','read as investigative reporting with love →'],
    ['Pre-action proceedings online since 1 May 2026','read as investigative reporting with love →'],
    ['State love online since 1 May 2026','read as investigative reporting with love →'],
    [`A time for state love through ${dateEn} →`,'the latest three kisses from the state →'],
    [`From 1 May 2026 through ${dateEn}: ${count} passionate kisses from public authorities while waiting for Godot →`,''],
    ['MAIN STORY · CANNAINSIDER.EU NEWS · 7 AUGUST 2026 · EUROPEAN BRANCH · REPORT 07082026-011 →','']
  ]:[
    ['Aktivní soudní řízení on-line od 1. května 2026','číst jako investigativu s láskou →'],
    ['Předžalobní řízení on-line od 1. května 2026','číst jako investigativu s láskou →'],
    ['Státní láska online od 1. května 2026','číst jako investigativu s láskou →'],
    [`Státu lásky čas do ${dateCs} →`,'poslední tři polibky státu →'],
    [`Státu lásky čas od 1. května 2026 do ${dateCs} znamená celkem ${count} vášnivých polibků státních orgánů při čekání na Godota →`,''],
    ['ZPRÁVA DNE · CANNAINSIDER.EU NEWS · 7. 8. 2026 · EVROPSKÁ VĚTEV · REPORT 07082026-011 →','']
  ];
  rows.forEach((r,i)=>{const body=document.createElement('div');body.className='rollup-body';body.innerHTML=i<3?`<a href="zpravy/04082026-010.html">${isEn?'Open canonical chronology →':'Otevřít kanonickou chronologii →'}</a>`:i===5?`<a href="zpravy/07082026-011.html">${isEn?'Open report →':'Otevřít zprávu →'}</a>`:`<a href="zpravy/04082026-010.html">Godot online →</a>`;box.append(mk(r[0],r[1],body,i>=3))});
  const anchor=document.querySelector('.edition-bar')||document.querySelector('.nav'); anchor?.insertAdjacentElement('afterend',box);
})();
