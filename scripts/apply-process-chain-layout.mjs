import { readFile, writeFile } from 'node:fs/promises';

const timerPath = 'web/data/process-timers.json';
const htmlPaths = ['web/index.html','web/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
const missing = 'bez přiděleného č. j. / sp. zn.';
const chains = {
  'timer-review-nsz-6nzn-2026': {
    title: 'NSZ → MSZ Praha → KSZ Ostrava → OSZ Frýdek-Místek – OKTE / 1 ZN 7061/2026',
    active: 'OSZ Frýdek-Místek, sp. zn. 1 ZN 7061/2026 – pokračuje původní dvouměsíční lhůta; doplnění z 24. 8. a 2. 9. ji neobnovují.',
    steps: [
      ['2026-04-20',missing,'Mgr. Dušan Dvořák → NSZ','první podání v této procesní větvi'],
      ['2026-04-25','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','stížnost zahrnující také podání z 20. 4.'],
      ['2026-05-08','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','doplnění stížnosti'],
      ['2026-05-12','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','další doplnění stížnosti'],
      ['2026-05-13','č. j. 6 NZN 1737/2026-32','NSZ','postoupeno Městskému státnímu zastupitelství v Praze'],
      ['2026-06-11','č. j. 3 KZN 197/2026-12','MSZ Praha','část věci postoupena KSZ Ostrava'],
      ['2026-07-08','č. j. 4 KZN 7116/2026-45','KSZ Ostrava','část OKTE Frýdek-Místek postoupena OSZ Frýdek-Místek; vedeno pod sp. zn. 1 ZN 7061/2026'],
      ['2026-07-20','sp. zn. 4 KZN 7116/2026 / 1 ZN 7061/2026','Mgr. Dušan Dvořák','další doplnění původního podání'],
      ['2026-07-29','č. j. 4 KZN 7116/2026-50','KSZ Ostrava','doplnění z 20. 7. postoupeno OSZ Frýdek-Místek'],
      ['2026-08-24','sp. zn. 1 ZN 7061/2026; 4 KZN 7116/2026','Mgr. Dušan Dvořák / Edukativní konopná klinika','mimořádně naléhavé důkazní doplnění'],
      ['2026-09-02','sp. zn. 1 ZN 7061/2026; 4 KZN 7116/2026; 3 VZN 239/2026','Mgr. Dušan Dvořák → OSZ Frýdek-Místek','další mimořádně naléhavé doplnění; nová skutečnost KÚ × ÚVK PP; lhůta se nepřerušuje ani neobnovuje']
    ]
  },
  'timer-preaction-nsz-2026-07-14': {
    title: 'NSZ – předžalobní výzva a všechny dodatky',
    active: 'Aktivní zůstává nejzazší dobrovolný termín 11. 9. 2026; dodatky původní lhůtu samy neobnovují.',
    steps: [
      ['2026-07-14','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','předžalobní výzva'],
      ['2026-07-25','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','další doplnění předžalobní výzvy'],
      ['2026-07-27','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','další dodatek'],
      ['2026-07-29','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','další dodatek'],
      ['2026-08-01','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','5. dodatek; stanoveny kontrolní termíny'],
      ['2026-08-15','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','další doplnění'],
      ['2026-08-22','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','další doplnění'],
      ['2026-08-28','sp. zn. 6 NZN 1737/2026','Mgr. Dušan Dvořák → NSZ','mimořádně naléhavé doplnění']
    ]
  },
  'timer-review-vsz-praha-1vzn1678-2026': {
    title: 'VSZ Praha – dohledová a přezkumná větev',
    active: 'Aktivní je poslední neuzavřený dohled/přezkum; starší rozhodnuté kroky zůstávají v řetězci.',
    steps: [
      ['2026-06-16',missing,'Mgr. Dušan Dvořák → VSZ Praha','podnět k výkonu dohledu'],
      ['2026-06-22','č. j. 1 VZN 1678/2026-8','VSZ Praha','potvrzení přijetí podnětu k dohledu'],
      ['2026-07-02','sp. zn. 1 VZN 1678/2026','Mgr. Dušan Dvořák → VSZ Praha','doplnění dohledu'],
      ['2026-07-23','č. j. 1 VZN 1678/2026-70','VSZ Praha','vyrozumění – podnět k dohledu označen za nedůvodný'],
      ['2026-08-15','sp. zn. 1 VZN 1678/2026','Mgr. Dušan Dvořák → VSZ Praha','doplnění dohledu'],
      ['2026-08-25',missing,'Mgr. Dušan Dvořák → VSZ Praha','žádost o přezkoumání vyřízení MSZ'],
      ['2026-08-27',missing,'Mgr. Dušan Dvořák → VSZ Praha','další žádost o přezkoumání vyřízení MSZ'],
      ['2026-08-28',missing,'Mgr. Dušan Dvořák → VSZ Praha','mimořádně naléhavé doplnění dohledu']
    ]
  },
  'timer-review-vsz-olomouc-2026-07-10': {
    title: 'VSZ Olomouc – dohledová větev',
    active: 'Aktivní je poslední neuzavřený dohledový krok.',
    steps: [
      ['2026-07-10',missing,'Mgr. Dušan Dvořák → VSZ Olomouc','podnět k výkonu dohledu'],
      ['2026-07-16','č. j. 3 VZN 239/2026-27','VSZ Olomouc','sdělení, že dohled vykonávat nebude'],
      ['2026-08-15','sp. zn. 3 VZN 239/2026','Mgr. Dušan Dvořák → VSZ Olomouc','doplnění dohledu'],
      ['2026-08-24','sp. zn. 3 VZN 239/2026','Mgr. Dušan Dvořák → VSZ Olomouc','mimořádně naléhavé doplnění / na vědomí'],
      ['2026-09-02','sp. zn. 3 VZN 239/2026','Mgr. Dušan Dvořák → VSZ Olomouc','nová procesní skutečnost na vědomí v návaznosti na 1 ZN 7061/2026']
    ]
  },
  'timer-review-ksz-brno-2026-07-10': {
    title: 'OSZ Prostějov → KSZ Brno – přezkum 1 ZT 11/2010',
    active: 'Přezkumná větev KSZ Brno sp. zn. 1 KZT 475/2026.',
    steps: [
      ['2026-07-07','č. j. 1 ZT 11/2010-752','OSZ Prostějov','vyřízení / sdělení OSZ Prostějov'],
      ['2026-07-10','sp. zn. 1 KZT 475/2026','Mgr. Dušan Dvořák → KSZ Brno','žádost o přezkoumání vyřízení OSZ Prostějov'],
      ['2026-07-21','č. j. 1 KZT 475/2026-32','KSZ Brno','potvrzení přijetí žádosti o přezkum'],
      ['2026-08-15','sp. zn. 1 KZT 475/2026','Mgr. Dušan Dvořák','další důkazní / dohledové doplnění'],
      ['2026-08-24','sp. zn. 1 KZT 475/2026; 1 KZN 1079/2026','Mgr. Dušan Dvořák / EKK','další společné důkazní doplnění']
    ]
  },
  'timer-court-os-pro-prevence-2026': {
    title: 'OSZ Prostějov – preventivní podání z 12. 7. 2026 a doplnění',
    active: 'Preventivní podání zůstává jednou procesní větví; doplnění nevytvářejí nový časovač.',
    steps: [
      ['2026-07-12','sp. zn. 1 ZT 11/2010; nové preventivní podání bez samostatného č. j.','Mgr. Dušan Dvořák → OSZ / OS / PČR Prostějov','preventivní podání a žádost o součinnost'],
      ['2026-07-28','č. j. ZN 4/2026-6','OSZ Prostějov','navazující přípis k preventivnímu podání'],
      ['2026-08-15','č. j. ZN 4/2026-6','Mgr. Dušan Dvořák → OSZ Prostějov','doplnění; žádost o poučení a prověření stavu preventivního podání']
    ]
  },
  'timer-remedy-doc-cz-dd-2026-08-15-stiznost-ct-rada-ct-necinnost-smir': {
    title: 'Česká televize / Rada ČT – stížnost na nečinnost a její doplnění',
    active: 'Doplnění z 28. 8. 2026 nemění předmět stížnosti ani návrh na smír a nezahajuje novou lhůtu.',
    steps: [
      ['2026-08-15','evidence CT 338889/2025; sp. zn. 10 C 69/2026','Mgr. Dušan Dvořák → Česká televize / Rada ČT','důrazná stížnost na trvající nečinnost; požadavek procesního sdělení do 21. 8. a věcné odpovědi do 31. 8.'],
      ['2026-08-28','evidence CT 338889/2025; sp. zn. 10 C 69/2026; RRTV sp. zn. RRTV/2026/20/fej, č. j. RRTV/7757/2026-fej','Mgr. Dušan Dvořák → Česká televize / Rada ČT; RRTV na vědomí','doplnění stížnosti; výslovně nejde o novou stížnost ani nový počátek lhůt']
    ]
  },
  'timer-admin-kpr-175-2026-08-03': {
    title: 'KPR – stížnost podle § 175 a všechny dodatky',
    active: 'Jedna stížnostní větev; další dodatky se připojují bez restartu časovače, pokud z listiny neplyne opak.',
    steps: [
      ['2026-08-03','sp. zn. KPR 5080/2026','Mgr. Dušan Dvořák → KPR','stížnost podle § 175 správního řádu'],
      ['2026-08-29','sp. zn. KPR 5080/2026','Mgr. Dušan Dvořák → KPR','naléhavé doplnění / návazné podání']
    ]
  },
  'timer-remedy-doc-cz-dd-2026-08-15-doplneni-stiznosti-ministr-vnitra': {
    title: 'Ministr vnitra – stížnost a doplnění',
    active: 'Jedna stížnostní větev.',
    steps: [
      ['2026-08-15',missing,'Mgr. Dušan Dvořák → ministr vnitra','stížnost / doplnění stížnosti'],
      ['2026-08-24',missing,'Mgr. Dušan Dvořák → ministr vnitra','druhé mimořádně naléhavé doplnění']
    ]
  },
  'timer-remedy-doc-cz-dd-2026-08-15-zadost-prezkum-policejni-prezident': {
    title: 'Policejní prezident – stížnost / přezkum a doplnění',
    active: 'Jedna přezkumná větev.',
    steps: [
      ['2026-08-15',missing,'Mgr. Dušan Dvořák → policejní prezident','žádost o přezkum / stížnost'],
      ['2026-08-24','č. j. PPR-44020-2/ČJ-2026-990210-PD','Policejní prezidium / Mgr. Dušan Dvořák','navazující procesní krok a důkazní doplnění']
    ]
  },
  'timer-remedy-doc-cz-dd-2026-08-15-podnet-gibs': {
    title: 'GIBS – podnět a doplnění',
    active: 'Jedna podnětová větev.',
    steps: [
      ['2026-08-15',missing,'Mgr. Dušan Dvořák → GIBS','podnět'],
      ['2026-08-24',missing,'Mgr. Dušan Dvořák → GIBS','mimořádně naléhavé doplnění podnětu']
    ]
  }
};

const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const timerData = JSON.parse(await readFile(timerPath,'utf8'));
const byId = new Map(timerData.timers.map(t => [t.id,t]));
for (const [id, chain] of Object.entries(chains)) {
  const timer = byId.get(id);
  if (!timer) continue;
  timer.process_steps = chain.steps.map(([date,reference,actor,action]) => ({date,reference,actor,action}));
  timer.process_chain_title = chain.title;
  timer.active_chain_status = chain.active;
  timer.process_history = chain.steps.map(([date,reference,actor,action]) => `${date} · ${reference} · ${actor}: ${action}`).join(' → ');
}
timerData.process_chain_rule = 'one matter = one full process row from first filing; every step has date + č. j. / sp. zn.; only the last unresolved interval is active';
await writeFile(timerPath, JSON.stringify(timerData,null,2)+'\n','utf8');

const articleRe = id => new RegExp(`<article class="process-timer"[^>]*data-timer-id="${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*>[\\s\\S]*?<\\/article>`,'g');
const strip = (chain, en=false) => `<div class="process-chain-wrap"><div class="process-chain-caption"><b>${en?'Process chain':'Procesní řetězec'}:</b> ${esc(chain.active)}</div><div class="process-chain-strip" role="list" aria-label="${en?'Process chain':'Procesní řetězec'}">${chain.steps.map(([date,reference,actor,action])=>`<div class="process-chain-step" role="listitem"><time datetime="${esc(date)}">${esc(date)}</time><span class="process-chain-reference"><b>${en?'Ref. / case no.':'č. j. / sp. zn.'}:</b> ${esc(reference)}</span><span class="process-chain-actor">${esc(actor)}</span><span class="process-chain-action">${esc(action)}</span></div>`).join('<span class="process-chain-arrow" aria-hidden="true">→</span>')}</div></div>`;

for (const path of htmlPaths) {
  let html = await readFile(path,'utf8');
  const en = path.includes('/en.html') || path.includes('/news/');
  for (const [id,chain] of Object.entries(chains)) {
    const re = articleRe(id);
    const match = html.match(re);
    if (!match) continue;
    const old = match[0];
    let updated = old.replace(/<div class="process-chain-wrap">[\s\S]*?<\/div><\/div>(?=<\/article>)/g,'');
    updated = updated.replace('</article>', `${strip(chain,en)}</article>`);
    html = html.replace(old, updated);
  }
  await writeFile(path,html,'utf8');
}

for (const [id,chain] of Object.entries(chains)) {
  const timer = byId.get(id);
  if (!timer) continue;
  for (const step of chain.steps) {
    if (!step[0] || !step[1]) throw new Error(`PROCESS-CHAIN-GATE: ${id} has a step without date/reference`);
  }
}
for (const required of ['web/index.html','web/zpravy/04082026-010.html']) {
  const html = await readFile(required,'utf8');
  for (const id of Object.keys(chains)) {
    if (!byId.has(id)) continue;
    if (!html.includes(`data-timer-id="${id}"`)) continue;
    const re = articleRe(id); const m = html.match(re)?.[0] || '';
    if (!m.includes('process-chain-strip') || !m.includes('č. j. / sp. zn.')) throw new Error(`PROCESS-CHAIN-GATE: ${required} missing process strip/reference label for ${id}`);
  }
}
console.log(`Procesní pásy: ${Object.keys(chains).filter(id=>byId.has(id)).length} větví; každý krok má datum + č. j. / sp. zn.`);
