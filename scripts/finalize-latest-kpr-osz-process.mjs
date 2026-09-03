import { readFile, writeFile } from 'node:fs/promises';

const timerPath = 'web/data/process-timers.json';
const htmlPaths = ['web/index.html','web/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html'];
const updates = {
  'timer-review-nsz-6nzn-2026': {
    step: {date:'2026-09-03', reference:'č. j. 1 ZN 7061/2026-79', actor:'OSZ Frýdek-Místek', action:'vyrozumění o vyřízení; podání založena bez dalšího opatření; poučení o možnosti požádat KSZ Ostrava o přezkoumání podle § 16a odst. 7'},
    activeCs:'OSZ Frýdek-Místek vyřídilo věc dne 3. 9. 2026 pod č. j. 1 ZN 7061/2026-79. Původní běh je uzavřen; přezkum u KSZ Ostrava je pouze dostupný procesní krok, dokud není doloženo jeho podání.',
    activeEn:'The Frýdek-Místek District Public Prosecutor’s Office disposed of the matter on 3 September 2026 under ref. 1 ZN 7061/2026-79. The previous running period is closed; review by the Ostrava Regional Public Prosecutor’s Office is only an available next step unless and until a review request is filed.',
    deadlineCs:'2 měsíce – § 16a odst. 6 zákona o státním zastupitelství – uzavřeno vyřízením 3. 9. 2026',
    deadlineEn:'2 months – Section 16a(6) of the Public Prosecutor’s Office Act – closed by the disposition of 3 September 2026'
  },
  'timer-admin-kpr-175-2026-08-03': {
    step: {date:'2026-09-02', reference:'č. j. KPR 5080/2026', actor:'KPR', action:'vyřízení stížnosti podle § 175; současně sděleno, že o dalších podáních vedených pod KPR 5080/2026 dosud nebylo rozhodnuto'},
    activeCs:'Stížnost podle § 175 byla vyřízena 2. 9. 2026 pod č. j. KPR 5080/2026. KPR současně uvedla, že o dalších podáních pod KPR 5080/2026 dosud nebylo rozhodnuto; žádný nový opravný prostředek se bez doloženého podání nepředjímá.',
    activeEn:'The Section 175 complaint was dealt with on 2 September 2026 under ref. KPR 5080/2026. The Office also stated that later submissions under KPR 5080/2026 had not yet been decided; no new remedy is presumed unless a filing is documented.',
    deadlineCs:'60 dnů – § 175 odst. 5 správního řádu – stížnost vyřízena 2. 9. 2026 / další podání pod KPR 5080/2026 – dosud nerozhodnuta; přesná lhůta podle konkrétního procesního režimu',
    deadlineEn:'60 days – Section 175(5) of the Code of Administrative Procedure – complaint dealt with on 2 September 2026 / later submissions under KPR 5080/2026 – not yet decided; exact period depends on the applicable procedural regime'
  }
};

const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const data = JSON.parse(await readFile(timerPath,'utf8'));
for (const timer of data.timers || []) {
  const update = updates[timer.id];
  if (!update) continue;
  timer.process_steps = Array.isArray(timer.process_steps) ? timer.process_steps : [];
  if (!timer.process_steps.some(step => step.date === update.step.date && String(step.reference).includes(update.step.reference.replace(/^č\. j\. /,'')))) timer.process_steps.push(update.step);
  timer.process_steps.sort((a,b) => String(a.date).localeCompare(String(b.date)));
  timer.active_chain_status = update.activeCs;
  timer.deadline_chain = update.deadlineCs.split(' / ');
  timer.process_history = timer.process_steps.map(step => `${step.date} · ${step.reference} · ${step.actor}: ${step.action}`).join(' → ');
}
await writeFile(timerPath, JSON.stringify(data,null,2)+'\n','utf8');

const stepHtml = (step,en) => `<span class="process-chain-arrow" aria-hidden="true">→</span><div class="process-chain-step" role="listitem"><time datetime="${esc(step.date)}">${esc(step.date)}</time><span class="process-chain-reference"><b>${en?'Ref. / case no.':'č. j. / sp. zn.'}:</b> ${esc(step.reference)}</span><span class="process-chain-actor">${esc(step.actor)}</span><span class="process-chain-action">${esc(step.action)}</span></div>`;
const dedupeTimerArticles = html => {
  const seen = new Set();
  return html.replace(/<article class="process-timer"[^>]*data-timer-id="([^"]+)"[^>]*>[\s\S]*?<\/article>/g, (article,id) => {
    if (seen.has(id)) return '';
    seen.add(id);
    return article;
  });
};
const sectionById = (html,id) => {
  const marker = `id="${id}"`;
  const pos = html.indexOf(marker);
  if (pos < 0) return null;
  const start = html.lastIndexOf('<section',pos);
  if (start < 0) return null;
  const token = /<section\b|<\/section>/g;
  token.lastIndex = start;
  let depth = 0, m;
  while ((m = token.exec(html))) {
    if (m[0].startsWith('<section')) depth += 1; else depth -= 1;
    if (depth === 0) return {start,end:token.lastIndex,html:html.slice(start,token.lastIndex)};
  }
  return null;
};

for (const path of htmlPaths) {
  let html = await readFile(path,'utf8');
  const en = path.includes('/en.html') || path.includes('/news/');
  for (const [id,update] of Object.entries(updates)) {
    const marker = `data-timer-id="${id}"`;
    const start = html.indexOf(marker);
    if (start < 0) continue;
    const articleStart = html.lastIndexOf('<article', start);
    const articleEnd = html.indexOf('</article>', start);
    if (articleStart < 0 || articleEnd < 0) continue;
    let article = html.slice(articleStart, articleEnd + 10);
    const active = en ? update.activeEn : update.activeCs;
    const deadline = en ? update.deadlineEn : update.deadlineCs;
    article = article.replace(/(<div class="process-chain-caption"><b>[^<]+<\/b>)[\s\S]*?(<\/div><div class="process-chain-strip")/, `$1 ${esc(active)}$2`);
    article = article.replace(/(<div class="process-deadline-chain"[^>]*><span>[^<]+<\/span> )[\s\S]*?(<\/div>)/, `$1${esc(deadline)}$2`);
    if (!article.includes(`datetime="${update.step.date}"`) || !article.includes(update.step.reference)) {
      const wrapEnd = article.lastIndexOf('</div></div></article>');
      if (wrapEnd > -1) article = article.slice(0,wrapEnd) + stepHtml(update.step,en) + article.slice(wrapEnd);
    }
    html = html.slice(0,articleStart) + article + html.slice(articleEnd + 10);
  }
  html = dedupeTimerArticles(html);
  await writeFile(path,html,'utf8');
}

// EN Godot musí mít stejný kanonický blok časovačů jako EN titulní stránka.
// Dřívější generátor vytvářel anglickou chronologii bez této sekce a až validator odhalil 0/37.
{
  const enHome = await readFile('web/en.html','utf8');
  let enGodot = await readFile('web/news/04082026-010.html','utf8');
  const sourceSection = sectionById(enHome,'procesni-casovace');
  if (!sourceSection) throw new Error('LATEST-PROCESS-GATE: EN titulní stránka nemá procesni-casovace');
  const targetSection = sectionById(enGodot,'procesni-casovace');
  if (targetSection) enGodot = enGodot.slice(0,targetSection.start) + sourceSection.html + enGodot.slice(targetSection.end);
  else {
    const anchor = enGodot.indexOf('<section id="lhuty-a-necinnost"');
    if (anchor >= 0) enGodot = enGodot.slice(0,anchor) + sourceSection.html + enGodot.slice(anchor);
    else if (enGodot.includes('</main>')) enGodot = enGodot.replace('</main>', `${sourceSection.html}</main>`);
    else throw new Error('LATEST-PROCESS-GATE: EN Godot nemá místo pro vložení procesních časovačů');
  }
  await writeFile('web/news/04082026-010.html',dedupeTimerArticles(enGodot),'utf8');
}

const registryIds = new Set((data.timers || []).map(t => t.id));
for (const path of htmlPaths) {
  const html = await readFile(path,'utf8');
  const ids = [...html.matchAll(/data-timer-id="([^"]+)"/g)].map(m=>m[1]);
  const unique = new Set(ids);
  if (ids.length !== unique.size) throw new Error(`LATEST-PROCESS-GATE: ${path} obsahuje duplicitní timer ID`);
  if (unique.size !== registryIds.size || [...registryIds].some(id => !unique.has(id))) throw new Error(`LATEST-PROCESS-GATE: ${path} nemá úplnou paritu časovačů ${unique.size}/${registryIds.size}`);
}
const cz = await readFile('web/zpravy/04082026-010.html','utf8');
for (const needle of ['2026-09-03','1 ZN 7061/2026-79','2026-09-02','KPR 5080/2026']) if (!cz.includes(needle)) throw new Error(`LATEST-PROCESS-GATE: chybí ${needle}`);
console.log(`KPR 2. 9. a OSZ Frýdek-Místek 3. 9. promítnuty; CZ/EN home i Godot mají ${registryIds.size} unikátních timer ID bez duplicit.`);
