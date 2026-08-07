(() => {
  const english = document.documentElement.lang === 'en';
  const news = Array.isArray(window.cannaNews) ? window.cannaNews : [];
  const entries = news.map(item => ({
    href: english ? (item.hrefEn || item.href) : item.href,
    date: english ? item.dateEn : item.dateCs,
    score: item.score,
    title: english ? item.titleEn : item.titleCs,
    summary: english ? item.summaryEn : item.summaryCs,
    keywords: `${item.id} ${item.dateCs} ${item.dateEn} ${item.score} ${english ? item.keywordsEn : item.keywordsCs}`,
    isCzechOnly: english && !item.hrefEn
  }));

  const normalise = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const shell = document.createElement('section');
  shell.className = 'site-search';
  shell.id = english ? 'search' : 'vyhledat';
  shell.setAttribute('role', 'search');

  const label = document.createElement('label');
  label.htmlFor = 'site-search-input';
  label.textContent = english ? 'Search reports and case references' : 'Hledat ve zprávách a spisových značkách';

  const controls = document.createElement('div');
  controls.className = 'site-search-controls';
  const input = document.createElement('input');
  input.id = 'site-search-input';
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = english
    ? 'For example: 45 T 1/2024, Ministry, measurement…'
    : 'Například: 45 T 1/2024, ministerstvo, měření…';
  const count = document.createElement('span');
  count.className = 'site-search-count';
  count.setAttribute('aria-live', 'polite');
  controls.append(input, count);

  const results = document.createElement('div');
  results.className = 'site-search-results';
  results.hidden = true;
  shell.append(label, controls, results);

  const discoveryAnchor = document.querySelector('.news-lead, .lead-grid');
  const nav = document.querySelector('.nav');
  if (discoveryAnchor) {
    discoveryAnchor.insertAdjacentElement('afterend', shell);
  } else {
    nav?.insertAdjacentElement('afterend', shell);
  }

  const render = () => {
    const query = normalise(input.value).trim();
    results.replaceChildren();
    if (query.length < 2) {
      results.hidden = true;
      count.textContent = '';
      return;
    }

    const words = query.split(/\s+/).filter(Boolean);
    const matches = entries.filter(item => {
      const haystack = normalise(`${item.title} ${item.summary} ${item.keywords}`);
      return words.every(word => haystack.includes(word));
    }).slice(0, 8);

    count.textContent = english
      ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`
      : `${matches.length} ${matches.length === 1 ? 'výsledek' : matches.length < 5 ? 'výsledky' : 'výsledků'}`;
    results.hidden = false;

    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'site-search-empty';
      empty.textContent = english
        ? 'Nothing found in the published memory. This does not assess an external document.'
        : 'Ve zveřejněné paměti nebyla nalezena shoda. Nejde o posouzení cizí listiny.';
      results.append(empty);
      return;
    }

    matches.forEach(item => {
      const article = document.createElement('article');
      const meta = document.createElement('p');
      meta.className = 'kicker';
      meta.textContent = `${item.date} · ${item.score}${item.isCzechOnly ? ' · Czech report' : ''}`;
      const heading = document.createElement('h2');
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.title;
      if (item.isCzechOnly) link.hreflang = 'cs';
      heading.append(link);
      const summary = document.createElement('p');
      summary.textContent = item.summary;
      article.append(meta, heading, summary);
      results.append(article);
    });
  };

  input.addEventListener('input', render);

  const hash = english ? '#search' : '#vyhledat';
  document.querySelectorAll(`.nav a[href="${hash}"]`).forEach(link => {
    link.addEventListener('click', () => {
      window.setTimeout(() => input.focus(), 0);
    });
  });
})();
