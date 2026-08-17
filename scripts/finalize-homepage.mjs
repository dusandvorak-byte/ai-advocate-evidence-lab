import { readFile, writeFile } from 'node:fs/promises';

const homePath = 'web/index.html';
const documentsPath = 'project-memory/documents-2026.json';
const godotHref = 'zpravy/04082026-010.html#chronologie';

const registry = JSON.parse(await readFile(documentsPath, 'utf8'));
if (!Array.isArray(registry.documents)) throw new Error('documents-2026.json neobsahuje pole documents');

const stateCount = registry.documents.filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record').length;
const link = (label, href) => `<a href="${href}">${label}</a>`;

const section = `<section id="live-dockets" class="live-dockets" aria-label="Živá řízení a státní dokumenty">
  <p class="state-decision-counter"><strong data-state-document-count>${stateCount}</strong><span>Od 1. května 2026 stát a veřejné instituce vydaly tolik doložených rozhodnutí, sdělení a dalších procesních listin.</span></p>
  <section class="live-docket-bar court"><h2>Aktivní soudní řízení on-line od 1. května 2026</h2><div class="live-docket-links">
    ${link('Okresní soud v Prostějově, sp. zn. 2 T 104/2010 – obnova','zpravy/04082026-010.html#case-cz-os-pro-2t104-2010-obnova')}
    ${link('Okresní soud v Prostějově – prevence 2026','zpravy/04082026-010.html#case-cz-os-pro-prevence-2026')}
    ${link('Obvodní soud pro Prahu 4, sp. zn. 10 C 69/2026 – Česká televize','zpravy/04082026-010.html#case-cz-os-praha4-10c69-2026')}
    ${link('Městský soud v Praze, sp. zn. 18 A 17/2026 – NCOZ','zpravy/04082026-010.html#case-cz-ms-praha-18a17-2026')}
    ${link('Městský soud v Praze, sp. zn. 18 A 23/2026 – Ministerstvo spravedlnosti','zpravy/04082026-010.html#case-cz-ms-praha-18a23-2026')}
    ${link('Městský soud v Praze, sp. zn. 8 Ad 9/2026 – Ministerstvo zdravotnictví','zpravy/04082026-010.html#case-cz-ms-praha-8ad9-2026')}
    ${link('Městský soud v Praze, sp. zn. 45 T 1/2024 – vráceno Vrchním soudem v Praze','zpravy/04082026-010.html#case-cz-ms-praha-45t1-2024')}
  </div></section>
  <section class="live-docket-bar pretrial"><h2>Předžalobní řízení on-line od 1. května 2026</h2><div class="live-docket-links">
    ${link('OSZ Prostějov – prevence 2026','zpravy/04082026-010.html#case-cz-osz-pro-prevence-2026')}
    ${link('Policie ČR – prevence Prostějov 2026','zpravy/04082026-010.html#case-cz-pcr-prevence-prostejov-2026')}
    ${link('Policie ČR – interní přezkum KÚ','zpravy/04082026-010.html#case-cz-pcr-ku-interni-prezkum')}
    ${link('NSZ – předžalobní výzva','zpravy/04082026-010.html#case-cz-nsz-predzalobni-vyzva')}
    ${link('VSZ Praha – dohled MSZ','zpravy/04082026-010.html#case-cz-vsz-praha-dohled-msz')}
    ${link('MSZ Praha – přezkumy','zpravy/04082026-010.html#case-cz-msz-praha-prezkumy')}
    ${link('VSZ Olomouc – dohled KSZ Brno','zpravy/04082026-010.html#case-cz-vsz-olomouc-dohled-ksz-brno')}
    ${link('KSZ Brno – přezkumy','zpravy/04082026-010.html#case-cz-ksz-brno-prezkumy')}
    ${link('KPR – tři aktuální větve','zpravy/04082026-010.html#case-cz-kpr-tri-vetve')}
  </div></section>
  <section class="live-docket-bar state-love"><h2>Státní láska online od 1. května 2026</h2><div class="live-docket-links">
    ${link('Státu lásky čas · Pavouk řízení',godotHref)}
    ${link('Policie ČR – sdělení, rozhodnutí a opravné prostředky','zpravy/04082026-010.html#instituce-policie')}
    ${link('Státní zastupitelství – sdělení, rozhodnutí a opravné prostředky','zpravy/04082026-010.html#instituce-statni-zastupitelstvi')}
    ${link('Kancelář prezidenta republiky – tři větve řízení','zpravy/04082026-010.html#instituce-kpr')}
    ${link('Ministerstva – vnitra, spravedlnosti, zdravotnictví a kultury','zpravy/04082026-010.html#instituce-ministerstva')}
  </div></section>
</section>`;

function removeSectionById(html, id) {
  const marker = `id="${id}"`;
  const markerPos = html.indexOf(marker);
  if (markerPos === -1) return html;
  const start = html.lastIndexOf('<section', markerPos);
  if (start === -1) throw new Error(`Blok ${id} nemá počáteční <section>`);
  const token = /<section\b|<\/section>/g;
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    if (match[0].startsWith('<section')) depth += 1;
    else depth -= 1;
    if (depth === 0) return html.slice(0, start) + html.slice(token.lastIndex);
  }
  throw new Error(`Blok ${id} nemá uzavírací </section>`);
}

let home = await readFile(homePath, 'utf8');
home = home.replace(/<section class="newsroom-alert" id="prave-ted">[\s\S]*?<\/section>/, `<section class="newsroom-alert" id="prave-ted"><b>HLAVNÍ ZPRÁVA DNE</b><span>Desatero pastýřských listů ze dne 15. srpna 2026 propojuje deset podání s jejich veřejnými PDF.</span><a href="zpravy/15082026-012.html">Číst celý článek →</a></section>`);

const leadCard = `<article class="lead-card">
  <figure><img src="assets/votruba/write-lawmakers.jpg" alt="Černobílá kresba Jiřího Votruby: ruka zapisuje zprávu"><figcaption>Jiří Votruba</figcaption></figure>
  <div><p class="kicker">HLAVNÍ ZPRÁVA DNE · CANNAINSIDER.EU NEWS · 15. 8. 2026 · PASTÝŘSKÉ LISTY · REPORT 15082026-012</p>
  <h1><a href="zpravy/15082026-012.html">Desatero pastýřských listů z Evropy u Ospělova</a></h1>
  <p class="standfirst">Deset podání s aktivními PDF, soudní termíny ve věci 45 T 1/2024 a pozvánka na Noc básníků 21. srpna.</p>
  <div class="score score-red"><strong>9/9</strong><span>DESET PASTÝŘSKÝCH LISTŮ · AKTIVNÍ PDF</span></div>
  <div class="news-meta"><span>15. 8. 2026</span><span>Konopná církev</span><span>10 podání v PDF</span><span>Jiří Votruba</span></div></div>
</article>`;
const leadRollup = `<details class="home-rollup home-rollup-heavy lead-rollup"><summary><span class="rollup-title">ZPRÁVA DNE · CANNAINSIDER.EU NEWS · 15. 8. 2026 · PASTÝŘSKÉ LISTY · REPORT 15082026-012 →</span><span class="rollup-prompt"></span><span class="rollup-heart">❤️</span><b>Rozbalit →</b></summary>${leadCard}</details>`;

home = home.replace(/<details class="home-rollup home-rollup-heavy lead-rollup">[\s\S]*?<\/details>/, leadRollup);
if (!home.includes('class="home-rollup home-rollup-heavy lead-rollup"')) {
  home = home.replace(/<article class="lead-card">[\s\S]*?<\/article>/, leadRollup);
} else {
  home = home.replace(/<article class="lead-card">[\s\S]*?<\/article>/, leadCard);
}

home = home.replace(/<div class="news-stack">[\s\S]*?<\/div>\s*<\/section>/, `<div class="news-stack">
  <article class="news-card"><p class="kicker">2. ZPRÁVA · REPORT 04082026-010 · PRŮBĚŽNĚ AKTUALIZOVÁNO</p><h2><a href="${godotHref}">Státu lásky čas</a></h2><p>Godot on-line: chronologická mapa řízení, rozhodnutí, vyrozumění, výzev a procesních vazeb. Dnešní reakce EUDA je zařazena do chronologie.</p><div class="news-meta"><span>9/9 · Godot on-line</span></div></article>
  <article class="news-card"><p class="kicker">24. 7. 2026 · REPORT 24072026-006</p><h3><a href="zpravy/24072026-006.html">Konopná církev nechce zázrak. Chce rozhodnutí</a></h3><div class="news-meta"><span>8/9 · Vysoká relevance</span></div></article>
</div></section>`);

home = home.replace(/data-exclude-ids="[^"]*"/, 'data-exclude-ids="04082026-010 24072026-006"');
if (!home.includes('<link rel="stylesheet" href="live-dockets.css">')) home = home.replace('</head>', '  <link rel="stylesheet" href="live-dockets.css">\n</head>');
if (!home.includes('<script src="live-dockets.js" defer></script>')) home = home.replace('</body>', '  <script src="live-dockets.js" defer></script>\n</body>');
// Každý globální vstup do Godota vede přímo na chronologii Státu lásky čas.
home = home.replace(/href="zpravy\/04082026-010\.html"(?=>Godot online →<\/a>)/g, `href="${godotHref}"`);
home = removeSectionById(home, 'live-dockets');
const editionBar = /(<div class="edition-bar">[\s\S]*?<\/div>)/;
if (!editionBar.test(home)) throw new Error('Na titulní stránce chybí edition-bar pro vložení tří lišt');
home = home.replace(editionBar, `$1\n${section}`);
if (!home.includes(`href="${godotHref}">Godot online →</a>`)) throw new Error('Godot online nevede přímo na Státu lásky čas');
await writeFile(homePath, home, 'utf8');
console.log(`Titulní strana: Godot vede přímo na chronologii; tři lišty jsou generovány jednotně. Počet veřejných institucionálních listin: ${stateCount}.`);
