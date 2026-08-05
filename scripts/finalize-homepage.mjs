import { readFile, writeFile } from 'node:fs/promises';

const homePath = 'web/index.html';
const documentsPath = 'project-memory/documents-2026.json';

const registry = JSON.parse(await readFile(documentsPath, 'utf8'));
if (!Array.isArray(registry.documents)) {
  throw new Error('documents-2026.json neobsahuje pole documents');
}

const stateCount = registry.documents.filter(item =>
  item.issue_date >= '2026-05-01' && item.document_type === 'state_record'
).length;

const link = (label, href) => `<a href="${href}">${label}</a>`;

const section = `<section id="live-dockets" class="live-dockets" aria-label="Živá řízení a státní dokumenty">
  <p class="state-decision-counter"><strong data-state-document-count>${stateCount}</strong><span>Od 1. května 2026 stát vydal tolik doložených rozhodnutí, sdělení a dalších procesních listin. Počet se téměř každý den zvyšuje.</span></p>
  <section class="live-docket-bar court">
    <h2>Aktivní soudní řízení on-line od 1. května 2026</h2>
    <div class="live-docket-links">
      ${link('OS Prostějov sp. zn. 2 T 104/2010 – obnova', 'zpravy/04082026-010.html#case-cz-os-pro-2t104-2010-obnova')}
      ${link('OS Prostějov – prevence 2026', 'zpravy/04082026-010.html#case-cz-os-pro-prevence-2026')}
      ${link('OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize', 'zpravy/04082026-010.html#case-cz-os-praha4-10c69-2026')}
      ${link('MS v Praze sp. zn. 18 A 17/2026 – NCOZ', 'zpravy/04082026-010.html#case-cz-ms-praha-18a17-2026')}
      ${link('MS v Praze sp. zn. 18 A 23/2026 – MSp', 'zpravy/04082026-010.html#case-cz-ms-praha-18a23-2026')}
      ${link('MS v Praze sp. zn. 8 Ad 9/2026 – MZ', 'zpravy/04082026-010.html#case-cz-ms-praha-8ad9-2026')}
      ${link('MS v Praze sp. zn. 45 T 1/2024 – vratka VS', 'zpravy/04082026-010.html#case-cz-ms-praha-45t1-2024')}
    </div>
  </section>
  <section class="live-docket-bar pretrial">
    <h2>Předžalobní řízení on-line od 1. května 2026</h2>
    <div class="live-docket-links">
      ${link('OSZ Prostějov – prevence 2026', 'zpravy/04082026-010.html#case-cz-osz-pro-prevence-2026')}
      ${link('Policie ČR – prevence Prostějov 2026', 'zpravy/04082026-010.html#case-cz-pcr-prevence-prostejov-2026')}
      ${link('Policie ČR – interní přezkum KÚ', 'zpravy/04082026-010.html#case-cz-pcr-ku-interni-prezkum')}
      ${link('NSZ – předžalobní výzva', 'zpravy/04082026-010.html#case-cz-nsz-predzalobni-vyzva')}
      ${link('VSZ Praha – dohled MSZ', 'zpravy/04082026-010.html#case-cz-vsz-praha-dohled-msz')}
      ${link('MSZ Praha – přezkumy', 'zpravy/04082026-010.html#case-cz-msz-praha-prezkumy')}
      ${link('VSZ Olomouc – dohled KSZ Brno', 'zpravy/04082026-010.html#case-cz-vsz-olomouc-dohled-ksz-brno')}
      ${link('KSZ Brno – přezkumy', 'zpravy/04082026-010.html#case-cz-ksz-brno-prezkumy')}
      ${link('KPR – tři aktuální větve', 'zpravy/04082026-010.html#case-cz-kpr-tri-vetve')}
    </div>
  </section>
  <section class="live-docket-bar state-love">
    <h2>Státní láska online od 1. května 2026</h2>
    <div class="live-docket-links">
      ${link('Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?', 'zpravy/04082026-010.html#chronologie')}
      ${link('Policie ČR – sdělení, rozhodnutí a opravné prostředky', 'zpravy/04082026-010.html#instituce-policie')}
      ${link('Státní zastupitelství – sdělení, rozhodnutí a opravné prostředky', 'zpravy/04082026-010.html#instituce-statni-zastupitelstvi')}
      ${link('Kancelář prezidenta republiky – tři větve řízení', 'zpravy/04082026-010.html#instituce-kpr')}
      ${link('Ministerstva – vnitra, spravedlnosti, zdravotnictví a kultury', 'zpravy/04082026-010.html#instituce-ministerstva')}
    </div>
  </section>
</section>`;

let home = await readFile(homePath, 'utf8');

if (!home.includes('<link rel="stylesheet" href="live-dockets.css">')) {
  home = home.replace('</head>', '  <link rel="stylesheet" href="live-dockets.css">\n</head>');
}
if (!home.includes('<script src="live-dockets.js" defer></script>')) {
  home = home.replace('</body>', '  <script src="live-dockets.js" defer></script>\n</body>');
}

if (home.includes('id="live-dockets"')) {
  throw new Error('Titulní stránka už obsahuje blok live-dockets před statickou finalizací');
}

const editionBar = /(<div class="edition-bar">[\s\S]*?<\/div>)/;
if (!editionBar.test(home)) {
  throw new Error('Na titulní stránce chybí edition-bar pro vložení tří lišt');
}
home = home.replace(editionBar, `$1\n${section}`);

await writeFile(homePath, home, 'utf8');
console.log(`Tři statické lišty vloženy na titulní stránku; počet státních listin: ${stateCount}.`);
