(() => {
  const english = document.documentElement.lang === 'en';
  const news = Array.isArray(window.cannaNews) ? window.cannaNews : [];
  const entries = news.map(item => ({
    href: item.href,
    date: item.date,
    score: item.score,
    title: english ? item.titleEn : item.titleCs,
    summary: english ? item.summaryEn : item.summaryCs,
    keywords: `${item.id} ${item.date} ${item.score}`
  }));

  entries.push(...(english ? [
    {
      href: 'zpravy/22072026-002.html',
      date: '22 July 2026',
      score: '9/9',
      title: 'Show the sample, method and measurement uncertainty',
      summary: 'Alliance filing in Prague Municipal Court case 45 T 1/2024.',
      keywords: '22072026-002 45 T 1/2024 THC THCA measurement court'
    },
    {
      href: 'zpravy/20072026-001.html',
      date: '20 July 2026',
      score: '9/9',
      title: 'The Police filed the demand. The drawer closed again',
      summary: 'Police communication KRPM-100092-2/ČJ-2026-1412UO.',
      keywords: '20072026-001 police KRPM 100092 preventive filing'
    }
  ] : [
    {
      href: 'zpravy/22072026-002.html',
      date: '22. 7. 2026',
      score: '9/9',
      title: 'Ukažte vzorek, metodu i nejistotu měření',
      summary: 'Podnět aliance ve věci Městského soudu v Praze 45 T 1/2024.',
      keywords: '22072026-002 45 T 1/2024 THC THCA měření soud'
    },
    {
      href: 'zpravy/20072026-001.html',
      date: '20. 7. 2026',
      score: '9/9',
      title: 'Policie výzvu uložila. Šuplík se opět zavřel',
      summary: 'Policejní sdělení KRPM-100092-2/ČJ-2026-1412UO.',
      keywords: '20072026-001 policie KRPM 100092 preventivní podání'
    }
  ]));

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

  const nav = document.querySelector('.nav');
  nav?.insertAdjacentElement('afterend', shell);

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
      meta.textContent = `${item.date} · ${item.score}`;
      const heading = document.createElement('h2');
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.title;
      heading.append(link);
      const summary = document.createElement('p');
      summary.textContent = item.summary;
      article.append(meta, heading, summary);
      results.append(article);
    });
  };

  input.addEventListener('input', render);
})();
