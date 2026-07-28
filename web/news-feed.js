/*
 * Jeden společný zdroj novinek pro hlavní web i Konopnou církev.
 * Nová schválená zpráva se přidává pouze sem a na vlastní stránku článku.
 */
const cannaNews = [
  {
    id: '27072026-008',
    dateCs: '27. 7. 2026',
    dateEn: '27 July 2026',
    score: '9/9',
    titleCs: 'Pavouk český křižák z Branibor již více než 15 let splétá síť na trase Praha–Brno–Praha a zpět. Kdo tu síť rozmotá?',
    titleEn: 'The Czech orb-weaver from Branibor has been spinning a web along Prague–Brno–Prague and back for more than fifteen years. Who will untangle it?',
    summaryCs: 'Praha označila za příslušné Brno, Brno vrátilo věc Praze a pět listin ze dne 27. července rozšiřuje důkazní pavouk o všechny nové větve.',
    summaryEn: 'Prague identified Brno as competent, Brno returned the matter, and five records dated 27 July expand the evidence web with every new branch.',
    keywordsCs: 'NSZ MSZ Praha MSZ Brno KSZ Brno VSZ Praha 6 NZN 1737/2026 3 KZN 197/2026 3 ZN 140/2026 1 VZN 1678/2026 pavouk příslušnost',
    keywordsEn: 'Supreme Public Prosecutor Prague Brno 6 NZN 1737/2026 3 KZN 197/2026 3 ZN 140/2026 1 VZN 1678/2026 jurisdiction web',
    href: 'zpravy/27072026-008.html',
    hrefEn: 'news/27072026-008.html'
  },
  {
    id: '25072026-007',
    dateCs: '25. 7. 2026',
    dateEn: '25 July 2026',
    score: '9/9',
    titleCs: 'Lence Bradáčové s láskou',
    titleEn: 'To Lenka Bradáčová, with love',
    summaryCs: 'Kytici nahradila evidenční mapa: aktualizovaný článek připojuje rozšířený pavouk a pět přímých důkazních odkazů z 27. července.',
    summaryEn: 'An evidence map replaces the flowers: the updated report adds an expanded procedural web and five direct evidence links dated 27 July.',
    keywordsCs: 'Nejvyšší státní zastupitelství NSZ 6 NZN 1737/2026 Lenka Bradáčová dohled přezkum evidenční mapa',
    keywordsEn: 'Supreme Public Prosecutor NSZ 6 NZN 1737/2026 Lenka Bradáčová supervision review evidence map',
    href: 'zpravy/25072026-007.html'
  },
  {
    id: '24072026-006',
    dateCs: '24. 7. 2026',
    dateEn: '24 July 2026',
    score: '8/9',
    titleCs: 'Konopná církev nechce zázrak. Chce rozhodnutí',
    titleEn: 'The Cannabis Church is not asking for a miracle. It wants a decision',
    summaryCs: 'Ministerstvo kultury uvedlo, že podání velmi pečlivě posuzuje a zjištěné skutečnosti i další postup sdělí do 31. srpna 2026.',
    summaryEn: 'The Ministry of Culture says it is examining the filing very carefully and will report its findings and next step by 31 August 2026.',
    keywordsCs: 'Ministerstvo kultury Konopná církev rozhodnutí 31. srpna 2026 termín žádost',
    keywordsEn: 'Ministry of Culture Cannabis Church decision 31 August 2026 date application',
    href: 'zpravy/24072026-006.html'
  },
  {
    id: '24072026-005',
    dateCs: '24. 7. 2026',
    dateEn: '24 July 2026',
    score: '7/9',
    titleCs: 'Tady někdo neumí počítat. Tři rostliny konopí nejsou šest ani sedm',
    titleEn: 'Someone cannot count. Three cannabis plants are not six or seven',
    summaryCs: 'Stížnost G. F. a J. K. namítá rozpor v počtu rostlin.',
    summaryEn: 'A complaint by G. F. and J. K. alleges a contradiction in the plant count.',
    keywordsCs: 'Okresní soud Ostrava 15 T 11/2025 rostliny konopí počet stížnost anonymizováno',
    keywordsEn: 'Ostrava District Court 15 T 11/2025 cannabis plants count complaint anonymised',
    href: 'zpravy/24072026-005.html',
    hrefEn: 'news/24072026-005.html'
  },
  {
    id: '23072026-004',
    dateCs: '23. 7. 2026',
    dateEn: '23 July 2026',
    score: '9/9',
    titleCs: 'Ministerstvo: Nemůžeme být nápomocni. Kompetenční ping-pong míří k soudu',
    titleEn: 'Ministry: We cannot assist. The jurisdictional ping-pong is heading to court',
    summaryCs: 'Zásahová žaloba napadá souhrnné vyřízení dvou obsahově odlišných stížností.',
    summaryEn: 'An intervention action challenges the combined handling of two distinct complaints.',
    keywordsCs: 'Ministerstvo vnitra zásahová žaloba Městský soud Praha kompetence stížnosti 2026',
    keywordsEn: 'Ministry of the Interior intervention action Prague Municipal Court jurisdiction complaints 2026',
    href: 'zpravy/23072026-004.html'
  },
  {
    id: '22072026-002',
    dateCs: '22. 7. 2026',
    dateEn: '22 July 2026',
    score: '9/9',
    titleCs: 'U každé konopné stopy ukažte vzorek, metodu i nejistotu měření',
    titleEn: 'Show the sample, method and measurement uncertainty for every cannabis trace',
    summaryCs: 'Podnět aliance žádá v řízení 45 T 1/2024 přesně doložit vzorek, metodu a nejistotu měření.',
    summaryEn: 'An alliance filing asks case 45 T 1/2024 to document the sample, method and measurement uncertainty.',
    keywordsCs: 'Městský soud Praha 45 T 1/2024 THC THCA měření vzorek metoda nejistota',
    keywordsEn: 'Prague Municipal Court 45 T 1/2024 THC THCA measurement sample method uncertainty',
    href: 'zpravy/22072026-002.html'
  },
  {
    id: '20072026-001',
    dateCs: '20. 7. 2026',
    dateEn: '20 July 2026',
    score: '9/9',
    titleCs: 'Policie výzvu uložila. Jinými slovy: šuplík se opět zavřel',
    titleEn: 'The Police filed the demand. In other words: the drawer closed again',
    summaryCs: 'Policie potvrdila přijetí a uložení podání bez dalšího opatření; věcná odpověď nepřišla.',
    summaryEn: 'The Police confirmed receipt and filing without further action; no substantive reply arrived.',
    keywordsCs: 'Policie Olomoucký kraj KRPM-100092-2/ČJ-2026-1412UO předžalobní výzva preventivní podání',
    keywordsEn: 'Police Olomouc Region KRPM-100092-2/ČJ-2026-1412UO pre-action demand preventive filing',
    href: 'zpravy/20072026-001.html'
  }
];

window.cannaNews = cannaNews;

const feed = document.querySelector('[data-shared-news-feed]');
if (feed) {
  const english = document.documentElement.lang === 'en';
  const excluded = new Set(
    String(feed.dataset.excludeIds || '')
      .split(/\s+/)
      .filter(Boolean)
  );
  const visibleNews = cannaNews.filter(item => !excluded.has(item.id));
  feed.innerHTML = visibleNews.map(item => `
    <article class="news-card">
      <p class="kicker">${english ? item.dateEn : item.dateCs} · REPORT ${item.id}</p>
      <h2><a href="${english ? (item.hrefEn || item.href) : item.href}"${english && !item.hrefEn ? ' hreflang="cs"' : ''}>${english ? item.titleEn : item.titleCs}</a></h2>
      <p>${english ? item.summaryEn : item.summaryCs}</p>
      <div class="news-meta"><span>${item.score}</span>${english && !item.hrefEn ? '<span>Czech report</span>' : ''}</div>
    </article>
  `).join('');
}
