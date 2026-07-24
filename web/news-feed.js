/*
 * Jeden společný zdroj novinek pro hlavní web i Konopnou církev.
 * Nová schválená zpráva se přidává pouze sem a na vlastní stránku článku.
 */
const cannaNews = [
  {
    id: '24072026-006',
    date: '24. 7. 2026',
    score: '8/9',
    titleCs: 'Konopná církev nechce zázrak. Chce rozhodnutí',
    titleEn: 'The Cannabis Church is not asking for a miracle. It wants a decision',
    summaryCs: 'Ministerstvo kultury potvrdilo, že podání velmi pečlivě posuzuje, a přislíbilo sdělit zjištění a další postup do 31. srpna 2026.',
    summaryEn: 'The Ministry of Culture says it is examining the filing very carefully and will report its findings and next step by 31 August 2026.',
    href: 'zpravy/24072026-006.html'
  },
  {
    id: '24072026-005',
    date: '24. 7. 2026',
    score: '7/9',
    titleCs: 'Tady někdo neumí počítat. Tři rostliny konopí nejsou šest ani sedm',
    titleEn: 'Someone cannot count. Three cannabis plants are not six or seven',
    summaryCs: 'Stížnost G. F. a J. K. namítá rozpor v počtu rostlin.',
    summaryEn: 'A complaint by G. F. and J. K. alleges a contradiction in the plant count.',
    href: 'zpravy/24072026-005.html'
  },
  {
    id: '23072026-004',
    date: '23. 7. 2026',
    score: '9/9',
    titleCs: 'Ministerstvo: Nemůžeme být nápomocni. Kompetenční ping-pong míří k soudu',
    titleEn: 'Ministry: We cannot assist. The jurisdictional ping-pong is heading to court',
    summaryCs: 'Zásahová žaloba napadá souhrnné vyřízení dvou obsahově odlišných stížností.',
    summaryEn: 'An intervention action challenges the combined handling of two distinct complaints.',
    href: 'zpravy/23072026-004.html'
  }
];

const feed = document.querySelector('[data-shared-news-feed]');
if (feed) {
  const english = document.documentElement.lang === 'en';
  feed.innerHTML = cannaNews.map(item => `
    <article class="news-card">
      <p class="kicker">${item.date} · REPORT ${item.id}</p>
      <h2><a href="${item.href}">${english ? item.titleEn : item.titleCs}</a></h2>
      <p>${english ? item.summaryEn : item.summaryCs}</p>
      <div class="news-meta"><span>${item.score}</span></div>
    </article>
  `).join('');
}
