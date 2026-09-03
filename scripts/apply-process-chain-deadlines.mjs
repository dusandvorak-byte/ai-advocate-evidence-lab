import { readFile, writeFile } from 'node:fs/promises';

const timerPath = 'web/data/process-timers.json';
const htmlPaths = ['web/index.html','web/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
const deadlineChains = {
  'timer-review-nsz-6nzn-2026': ['2 měsíce – § 16a odst. 6 zákona o státním zastupitelství'],
  'timer-preaction-nsz-2026-07-14': ['do 21. 8. 2026 alespoň sdělení', 'do 11. 9. 2026 konečné stanovisko'],
  'timer-review-vsz-praha-1vzn1678-2026': ['dohled – bez univerzální pevné číselné lhůty', 'přezkum vyřízení – podle konkrétního režimu podání'],
  'timer-review-vsz-olomouc-2026-07-10': ['dohled – bez univerzální pevné číselné lhůty'],
  'timer-review-ksz-brno-2026-07-10': ['přezkum vyřízení – podle zákona o státním zastupitelství'],
  'timer-court-os-pro-prevence-2026': ['preventivní podání – bez doložené univerzální pevné číselné lhůty'],
  'timer-remedy-doc-cz-dd-2026-08-15-stiznost-ct-rada-ct-necinnost-smir': ['do 21. 8. 2026 procesní sdělení', 'do 31. 8. 2026 věcná písemná odpověď'],
  'timer-admin-kpr-175-2026-08-03': ['60 dnů – § 175 odst. 5 správního řádu'],
  'timer-remedy-doc-cz-dd-2026-08-15-doplneni-stiznosti-ministr-vnitra': ['stížnost – lhůta dle konkrétního režimu'],
  'timer-remedy-doc-cz-dd-2026-08-15-zadost-prezkum-policejni-prezident': ['přezkum / stížnost – lhůta dle konkrétního režimu'],
  'timer-remedy-doc-cz-dd-2026-08-15-podnet-gibs': ['podnět – lhůta dle konkrétního režimu'],
  'timer-admin-krpt-infz-2026-07-27': ['15 dnů + až 10 dnů – žádost podle InfZ', 'odvolání podle § 16 InfZ – navazující odvolací lhůta'],
  'timer-admin-mk-2026-07-22': ['30 dnů základně; ve složité věci možnost zákonného prodloužení', 'rozklad podle § 152 správního řádu – navazující rozkladové řízení'],
  'timer-court-8ad9-2026': ['soudní řízení 8 Ad 9/2026 – bez pevné číselné lhůty k meritornímu rozhodnutí', 'nová zásahová žaloba proti SÚKL – bez pevné číselné lhůty k meritornímu rozhodnutí'],
  'timer-court-mv-2026-07-23': ['řízení 15 A 44/2026 – bez pevné číselné lhůty k meritornímu rozhodnutí', 'kasační řízení před NSS – bez pevné číselné lhůty k meritornímu rozhodnutí']
};

const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const data = JSON.parse(await readFile(timerPath,'utf8'));
for (const timer of data.timers || []) {
  const chain = deadlineChains[timer.id];
  if (chain) timer.deadline_chain = chain;
}
data.deadline_chain_rule = 'full applicable deadline / each subsequent deadline after a remedy, separated by slashes; never invent a numeric deadline';
await writeFile(timerPath, JSON.stringify(data,null,2)+'\n','utf8');

const articleRe = id => new RegExp(`<article class="process-timer"[^>]*data-timer-id="${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*>[\\s\\S]*?<\\/article>`,'g');
const render = (labels,en=false) => `<div class="process-deadline-chain" style="margin:.65rem 0;padding:.55rem .7rem;border:1px solid currentColor;font-weight:700;overflow-x:auto;white-space:nowrap"><span>${en?'Deadline chain':'Řetězec lhůt'}:</span> ${labels.map(esc).join(' / ')}</div>`;

for (const path of htmlPaths) {
  let html = await readFile(path,'utf8');
  const en = path.includes('/en.html') || path.includes('/news/');
  for (const [id,labels] of Object.entries(deadlineChains)) {
    const re = articleRe(id);
    const match = html.match(re)?.[0];
    if (!match) continue;
    let updated = match.replace(/<div class="process-deadline-chain"[\s\S]*?<\/div>/g,'');
    updated = updated.replace(/(<div class="timer-detail">)/, `$1${render(labels,en)}`);
    html = html.replace(match, updated);
  }
  await writeFile(path,html,'utf8');
}

for (const [id,labels] of Object.entries(deadlineChains)) {
  if (!Array.isArray(labels) || !labels.length || labels.some(x => !String(x).trim())) throw new Error(`DEADLINE-CHAIN-GATE: neplatný řetězec ${id}`);
}
const godot = await readFile('web/zpravy/04082026-010.html','utf8');
if (!godot.includes('Řetězec lhůt:')) throw new Error('DEADLINE-CHAIN-GATE: Godot neobsahuje řetězec lhůt');
if (!godot.includes(' / ')) throw new Error('DEADLINE-CHAIN-GATE: chybí lomítka mezi navazujícími lhůtami');
console.log(`Řetězce lhůt: ${Object.keys(deadlineChains).length} procesních větví.`);
