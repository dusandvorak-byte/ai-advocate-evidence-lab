import { readFile } from 'node:fs/promises';

const fail = message => { throw new Error(`CHURCH-CURRENT-STATE-GATE: ${message}`); };
const manifest = JSON.parse(await readFile('project-memory/document-sources.json','utf8'));
const documents = new Map();
for (const source of manifest.sources || []) {
  const payload = JSON.parse(await readFile(source.path,'utf8'));
  for (const item of payload.documents || []) {
    const previous = documents.get(item.id) || {};
    documents.set(item.id,{...previous,...item,public:{...(previous.public||{}),...(item.public||{})}});
  }
}

const decisionId = 'doc-cz-mk-2026-08-31-mk-53547-2026-socns';
const statementId = 'doc-cz-mk-2026-08-31-mk-53559-2026-socns';
const remonstranceId = 'doc-cs-dd-2026-09-01-slalom-augsep-022';
const remonstrancePdf = 'documents/justice-slalom/2026-09/022-podani-2026-09-01.pdf';

const decision = documents.get(decisionId);
const statement = documents.get(statementId);
const remonstrance = documents.get(remonstranceId);
if (!decision || !statement || !remonstrance) fail('chybí usnesení, sdělení nebo rozklad v kanonickém registru');
if (decision.issue_date !== '2026-08-31' || statement.issue_date !== '2026-08-31') fail('nesprávné datum aktuálních listin Ministerstva kultury');
if (remonstrance.issue_date !== '2026-09-01' || remonstrance.received_date !== '2026-09-01') fail('rozklad nemá datum podání/doručení 1. 9. 2026');
if (remonstrance.document_type !== 'appeal') fail('rozklad není kanonicky veden jako opravný prostředek');
if (!remonstrance.relations?.some(rel => rel.type === 'reakce_na' && rel.target_id === decisionId)) fail('rozklad není kanonicky propojen jako reakce na MK 53547/2026 SOCNS');
if (remonstrance.public?.pdf !== remonstrancePdf) fail('rozklad nemá přímý veřejný PDF důkaz');

const timers = JSON.parse(await readFile('project-memory/process-timers.json','utf8'));
const timer = timers.timers?.find(item => item.id === 'timer-admin-mk-2026-07-22');
if (!timer) fail('chybí interní procesní větev Ministerstva kultury');
if (timer.status !== 'active_remonstrance_stage' || timer.start_date !== '2026-09-01') fail('interní procesní větev není v aktivní rozkladové fázi od 1. 9. 2026');
if (timer.href !== `zpravy/04082026-010.html#${decisionId}`) fail('interní procesní větev nevede na přesnou listinu MK 53547/2026');

const churchCz = await readFile('web/kc/index.html','utf8');
const churchEn = await readFile('web/kc/en.html','utf8');
const godotCz = await readFile('web/zpravy/04082026-010.html','utf8');
const godotEn = await readFile('web/news/04082026-010.html','utf8');

const czDecisionHref = `/ai-advocate-evidence-lab/zpravy/04082026-010.html#${decisionId}`;
const enDecisionHref = `/ai-advocate-evidence-lab/news/04082026-010.html#en-${decisionId}`;
const publicPdfHref = `/ai-advocate-evidence-lab/${remonstrancePdf}`;

for (const [label,page,decisionHref] of [
  ['CZ Church',churchCz,czDecisionHref],
  ['EN Church',churchEn,enDecisionHref]
]) {
  if (!page.includes('MK 53547/2026 SOCNS') || !page.includes('MK 53559/2026 SOCNS')) fail(`${label}: chybí aktuální rozhodnutí Ministerstva kultury`);
  if (!page.includes(decisionHref)) fail(`${label}: živá církevní paměť nevede na přesnou listinu MK 53547/2026`);
  if (!page.includes(publicPdfHref)) fail(`${label}: rozklad z 1. 9. 2026 nemá přímý PDF odkaz`);
  if (page.includes('#procesni-casovace')) fail(`${label}: vrátila se zrušená veřejná kotva procesních časovačů`);
  if (page.includes('<span>MINISTERSTVO KULTURY</span><h3>MK 49467/2026 SOCNS</h3>') || page.includes('<span>MINISTRY OF CULTURE</span><h3>MK 49467/2026 SOCNS</h3>')) fail(`${label}: aktuální uzel stále zvýrazňuje zastaralé MK 49467/2026`);
  const shellAxisCount = (page.match(/shell-axis\.css/g) || []).length;
  if (shellAxisCount !== 1) fail(`${label}: finální artefakt má ${shellAxisCount} odkazů na shell-axis.css místo jednoho`);
}

if (!churchCz.includes('Rozklad v PDF →')) fail('CZ Church: chybí zřetelný přímý odkaz na rozklad');
if (!churchEn.includes('Remonstrance PDF →')) fail('EN Church: chybí zřetelný přímý odkaz na remonstrance PDF');
if (!churchCz.includes('/ai-advocate-evidence-lab/index.html') || !churchCz.includes('https://www.konopijelek.cz/')) fail('CZ Church: chybí sesterské propojení');
if (!churchEn.includes('/ai-advocate-evidence-lab/en.html') || !churchEn.includes('https://www.konopijelek.cz/')) fail('EN Church: chybí sesterské propojení');

const czStart = godotCz.indexOf(`id="${decisionId}"`);
const enStart = godotEn.indexOf(`id="en-${decisionId}"`);
if (czStart < 0 || enStart < 0) fail('MK 53547/2026 chybí v CZ/EN Godotovi');
const czSlice = godotCz.slice(czStart, godotCz.indexOf('</li>',czStart)+5);
const enSlice = godotEn.slice(enStart, godotEn.indexOf('</li>',enStart)+5);
if (!czSlice.includes('Rozklad proti zastavení řízení o registraci Konopné církve') || !czSlice.includes(remonstrancePdf)) fail('CZ Godot nezobrazuje rozklad inline u MK 53547/2026 s přímým PDF');
if (!enSlice.includes('Administrative appeal against termination of the Church of Cannabis registration proceedings') || !enSlice.includes(remonstrancePdf)) fail('EN Godot nezobrazuje rozklad inline u MK 53547/2026 s přímým PDF');

console.log('Konopná církev: aktuální rozkladová fáze, přesné odkazy, CZ/EN parita a sesterské propojení OK.');
