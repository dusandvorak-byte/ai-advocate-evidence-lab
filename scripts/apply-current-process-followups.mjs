import { readFile, writeFile } from 'node:fs/promises';

const dataPath = 'web/data/process-timers.json';
const htmlPaths = ['web/index.html','web/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
const data = JSON.parse(await readFile(dataPath,'utf8'));
const timers = new Map(data.timers.map(t => [t.id,t]));

const patch = (id, values) => {
  const current = timers.get(id);
  if (!current) throw new Error(`FOLLOWUP-GATE: missing timer ${id}`);
  timers.set(id,{...current,...values});
};

patch('timer-admin-krpt-infz-2026-07-27', {
  title:'KŘP Moravskoslezského kraje / Ministerstvo vnitra – odvolání ve věci SOP OKTE Frýdek-Místek',
  reference:'KRPT-203594-8/ČJ-2026-0700KR · odvolání 24. 8. 2026',
  start_date:'2026-08-24',
  start_date_basis:'Žádost byla podána a doručena 27. 7. 2026. KŘP dne 20. 8. 2026 vydalo částečnou odpověď KRPT-203594-7/ČJ-2026-0700KR a rozhodnutí KRPT-203594-8/ČJ-2026-0700KR. Proti rozhodnutí bylo dne 24. 8. 2026 podáno a doručeno odvolání Ministerstvu vnitra prostřednictvím KŘP.',
  process_history:'27. 7. 2026 žádost o SOP → 5. 8. 2026 oznámení o prodloužení lhůty → 20. 8. 2026 částečná odpověď a rozhodnutí → 24. 8. 2026 odvolání proti KRPT-203594-8/ČJ-2026-0700KR.',
  status:'active_appeal_stage',
  limit_kind:'infz_appeal_pending',
  limit_label:'odvolání podle § 16 InfZ – aktivní odvolací fáze',
  legal_basis:'§ 16 zákona č. 106/1999 Sb.; původní lhůta žádosti již neběží, aktivní je odvolání podané a doručené 24. 8. 2026.',
  due_date:null
});

patch('timer-admin-mk-2026-07-22', {
  title:'Ministerstvo kultury – rozklad proti usnesení MK 53547/2026 SOCNS',
  reference:'MK-S 6893/2026 SOCNS · MK 53547/2026 SOCNS · MK 53559/2026 SOCNS',
  start_date:'2026-09-01',
  start_date_basis:'Ministerstvo kultury dne 31. 8. 2026 usnesením č. j. MK 53547/2026 SOCNS zastavilo řízení podle § 101 písm. b) správního řádu a samostatným sdělením č. j. MK 53559/2026 SOCNS odpovědělo na navazující otázky. Dne 1. 9. 2026 byl podán a doručen rozklad proti usnesení; vyjádření k MK 53559/2026 SOCNS bylo přiloženo jako podklad rozkladového řízení.',
  process_history:'26. 6. 2026 zahájení nového řízení → 7. 7. 2026 doplnění → 22. 7. 2026 sdělení MK → 24. 7. 2026 procesní upřesnění → 12. 8. 2026 potvrzení zahájení a sp. zn. MK-S 6893/2026 SOCNS → 19. 8. 2026 další podání → 31. 8. 2026 usnesení MK 53547/2026 SOCNS o zastavení řízení a sdělení MK 53559/2026 SOCNS → 1. 9. 2026 rozklad a vyjádření jako příloha rozkladu.',
  status:'active_remonstrance_stage',
  limit_kind:'remonstrance_pending',
  limit_label:'rozklad podle § 152 správního řádu – aktivní rozkladová fáze',
  legal_basis:'§ 152 správního řádu; původní lhůta řízení do 31. 8. 2026 skončila vydáním usnesení, aktivní je rozklad podaný a doručený 1. 9. 2026.',
  due_date:null,
  href:'zpravy/04082026-010.html#procesni-casovace'
});

data.timers=[...timers.values()];
await writeFile(dataPath,JSON.stringify(data,null,2)+'\n','utf8');

const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const articleRe=id=>new RegExp(`<article class="process-timer"[^>]*data-timer-id="${id}"[^>]*>[\\s\\S]*?<\\/article>`,'g');
const renderCz=t=>`<article class="process-timer" data-process-timer data-limit-kind="${esc(t.limit_kind)}" data-start-date="${esc(t.start_date)}" data-event-date="${esc(t.start_date)}" data-timer-id="${esc(t.id)}"><div class="timer-value"><span data-elapsed-days>…</span> / <span>${esc(t.limit_label)}</span></div><div class="timer-detail"><h4><a href="${esc(t.href||'zpravy/04082026-010.html#procesni-casovace')}">${esc(t.title)}</a></h4><p class="timer-basis"><b>Kdy:</b> ${esc(t.start_date)}</p><p class="timer-basis"><b>Č. j. / sp. zn.:</b> ${esc(t.reference)}</p><p class="timer-basis"><b>Co se stalo:</b> ${esc(t.start_date_basis)}</p><p class="timer-basis"><b>Lhůta / procesní režim:</b> ${esc(t.legal_basis)}</p><p class="timer-basis"><b>Průběh:</b> ${esc(t.process_history)}</p></div></article>`;
const english={
  'timer-admin-krpt-infz-2026-07-27':['Moravian-Silesian Police / Ministry of the Interior – FOI appeal on OKTE Frýdek-Místek SOPs','Request filed and delivered 27 July; response and decision issued 20 August; appeal filed and delivered 24 August.','Active stage: appeal under Section 16 of the Freedom of Information Act.'],
  'timer-admin-mk-2026-07-22':['Ministry of Culture – remonstrance against order MK 53547/2026 SOCNS','The Ministry stopped the new-proceedings case by order MK 53547/2026 SOCNS and issued statement MK 53559/2026 SOCNS on 31 August. A remonstrance and its supporting statement were filed and delivered on 1 September.','Active stage: remonstrance under Section 152 of the Administrative Procedure Code.']
};
const renderEn=(t,x)=>`<article class="process-timer" data-process-timer data-limit-kind="${esc(t.limit_kind)}" data-start-date="${esc(t.start_date)}" data-event-date="${esc(t.start_date)}" data-timer-id="${esc(t.id)}"><div class="timer-value"><span data-elapsed-days>…</span> / <span>active procedural stage</span></div><div class="timer-detail"><h4><a href="news/04082026-010.html#chronology">${esc(x[0])}</a></h4><p class="timer-basis"><b>When:</b> ${esc(t.start_date)}</p><p class="timer-basis"><b>Reference:</b> ${esc(t.reference)}</p><p class="timer-basis"><b>What happened:</b> ${esc(x[1])}</p><p class="timer-basis"><b>Time limit / procedural regime:</b> ${esc(x[2])}</p></div></article>`;
for(const path of htmlPaths){
  let html=await readFile(path,'utf8');
  const isEn=path.includes('/en.html')||path.includes('/news/');
  for(const [id,x] of Object.entries(english)){
    const t=timers.get(id); const re=articleRe(id);
    if(!re.test(html)) throw new Error(`FOLLOWUP-GATE: ${path} missing ${id}`);
    re.lastIndex=0;
    html=html.replace(re,isEn?renderEn(t,x):renderCz(t));
  }
  if(/69\s*\/\s*30 dnů základně/.test(html)) throw new Error(`FOLLOWUP-GATE: ${path} still exposes obsolete MK timer`);
  if(/38\s*\/\s*15 \+ až 10 dnů/.test(html)) throw new Error(`FOLLOWUP-GATE: ${path} still exposes obsolete KRPT timer`);
  await writeFile(path,html,'utf8');
}
console.log('Aktivní procesní fáze posunuty: KRPT → odvolání 24. 8. 2026; MK → rozklad 1. 9. 2026.');
