import { readFile, writeFile } from 'node:fs/promises';

const path = 'web/index.html';
let html = await readFile(path, 'utf8');

const todayCz = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(new Date()).replace(/\.$/, '');

function convertDocket(kind, expectedTitle) {
  const re = new RegExp(`<section class="live-docket-bar ${kind}"><h2>${expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h2><div class="live-docket-links">([\\s\\S]*?)<\\/div><\\/section>`);
  const match = html.match(re);
  if (!match) throw new Error(`Nenalezen blok pro roletku: ${expectedTitle}`);
  html = html.replace(re,
    `<details class="live-docket-bar ${kind} home-rollup"><summary><span>${expectedTitle}</span><b>rozbalit</b></summary><div class="live-docket-links">$1</div></details>`
  );
}

convertDocket('court', 'Aktivní soudní řízení on-line od 1. května 2026');
convertDocket('pretrial', 'Předžalobní řízení on-line od 1. května 2026');
convertDocket('state-love', 'Státní láska online od 1. května 2026');

const latestRe = /<section id="latest-records" class="latest-records"[^>]*><header><p class="section-label">NEJNOVĚJŠÍ OVĚŘENÉ LISTINY<\/p><h2>[^<]*<\/h2><p>([^<]*)<\/p><\/header><div class="latest-record-grid">([\s\S]*?)<\/div><\/section>/;
const latest = html.match(latestRe);
if (!latest) throw new Error('Nenalezen blok Nejnovější ověřené listiny pro převod na roletku');
const countText = latest[1];
const cards = latest[2];
html = html.replace(latestRe,
  `<details id="latest-records" class="latest-records latest-records-dropdown home-rollup"><summary><span><small>NEJNOVĚJŠÍ OVĚŘENÉ LISTINY</small><strong>Kanonická důkazní paměť do ${todayCz}</strong><em>${countText}</em></span><b>rozbalit</b></summary><div class="latest-record-grid">${cards}</div></details>`
);

if (!html.includes('href="home-rollups.css"')) {
  html = html.replace('</head>', '<link rel="stylesheet" href="home-rollups.css"></head>');
}

const requiredCourt = [
  'OS Prostějov sp. zn. 2 T 104/2010 – obnova',
  'OS Prostějov – prevence 2026',
  'OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize',
  'MS v Praze sp. zn. 18 A 17/2026 – NCOZ',
  'MS v Praze sp. zn. 18 A 23/2026 – MSp',
  'MS v Praze sp. zn. 8 Ad 9/2026 – MZ',
  'MS v Praze sp. zn. 45 T 1/2024 – vratka VS'
];
const requiredPretrial = [
  'OSZ Prostějov – prevence 2026',
  'Policie ČR – prevence Prostějov 2026',
  'Policie ČR – interní přezkum KÚ',
  'NSZ – předžalobní výzva',
  'VSZ Praha – dohled MSZ',
  'MSZ Praha – přezkumy',
  'VSZ Olomouc – dohled KSZ Brno',
  'KSZ Brno – přezkumy',
  'KPR – tři aktuální větve'
];
const requiredStateLove = [
  'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?',
  'Policie ČR – sdělení, rozhodnutí a opravné prostředky',
  'Státní zastupitelství – sdělení, rozhodnutí a opravné prostředky',
  'Kancelář prezidenta republiky – tři větve řízení',
  'Ministerstva – vnitra, spravedlnosti, zdravotnictví a kultury'
];
const requiredLatest = [
  '12. 8. 2026', 'Ministerstvo kultury', 'MK 49467/2026 SOCNS',
  'Kancelář prezidenta republiky', '4873/2026',
  '11. 8. 2026', 'Ministerstvo vnitra', 'MV-127234-2/OBP-2026'
];
for (const text of [...requiredCourt, ...requiredPretrial, ...requiredStateLove, ...requiredLatest]) {
  if (!html.includes(text)) throw new Error(`Titulní roletky postrádají povinný obsah: ${text}`);
}
if (!html.includes(`Kanonická důkazní paměť do ${todayCz}`)) throw new Error('Kanonická paměť nemá dnešní datum');
if ((html.match(/class="live-docket-bar [^"]*home-rollup"/g) || []).length !== 3) throw new Error('Nejsou přesně tři procesní roletky');

await writeFile(path, html, 'utf8');
console.log(`Titulní roletky vytvořeny; kanonická paměť: ${todayCz}.`);
