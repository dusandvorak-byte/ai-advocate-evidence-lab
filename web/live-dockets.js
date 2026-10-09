(async () => {
  const isEnglish = document.documentElement.lang === 'en';
  const ensureStylesheet = href => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  };
  const cssHref = 'home-rollups.css';
  const liveDocketsCssHref = 'live-dockets.css';
  ensureStylesheet(`/ai-advocate-evidence-lab/${cssHref}`);
  ensureStylesheet(`/ai-advocate-evidence-lab/${liveDocketsCssHref}`);

  const brandSubtitle = document.querySelector('.masthead .brand span');
  if (brandSubtitle) {
    brandSubtitle.textContent = isEnglish
      ? 'Evidence reporter on state conduct, corruption and cannabis policy'
      : 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
  }

  const registryUrl = '/ai-advocate-evidence-lab/data/active-court-dockets.json';
  let courtRegistry;
  try {
    const response = await fetch(registryUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    courtRegistry = await response.json();
  } catch (error) {
    console.error('ACTIVE_COURTS_REGISTRY_FAILED', error);
    return;
  }
  if (!Array.isArray(courtRegistry.rows) || courtRegistry.rows.length === 0) return;

  document.getElementById('live-dockets')?.remove();
  document.querySelector('.nav .nav-courts')?.remove();
  document.querySelector('.godot-rollup')?.remove();
  document.querySelector('.godot-rollup-link')?.remove();

  const leadSection = document.querySelector('.news-lead');
  const legacyLeadRollup = document.querySelector('.lead-rollup');
  const embeddedLeadCard = legacyLeadRollup?.querySelector('.lead-card');
  if (leadSection && embeddedLeadCard) leadSection.replaceChildren(embeddedLeadCard.cloneNode(true));
  else legacyLeadRollup?.remove();
  document.querySelector('.lead-rollup-link')?.remove();
  document.querySelector('.newsroom-alert')?.remove();

  const summaryMarkup = title =>
    `<span class="rollup-title">${title}</span><span class="rollup-prompt">${isEnglish ? 'read as an investigation with love' : 'číst jako investigativu s láskou'}</span><span class="rollup-heart" aria-hidden="true">❤️</span><b class="rollup-action">${isEnglish ? 'Expand ↓' : 'Rozbalit ↓'}</b>`;

  const wrapper = document.createElement('section');
  wrapper.id = 'live-dockets';
  wrapper.className = 'live-dockets home-rollup-stack home-rollup-stack-primary has-docket-controls';
  wrapper.setAttribute('aria-label', isEnglish ? 'Primary evidence entries' : 'Hlavní důkazní vstupy');

  const courtShell = document.createElement('section');
  courtShell.className = 'justice-slalom-shell court-docket-shell';
  const courtDetails = document.createElement('details');
  courtDetails.id = 'active-court-proceedings';
  courtDetails.className = 'home-rollup justice-slalom court-docket-panel docket-controlled';
  const courtSummary = document.createElement('summary');
  courtSummary.innerHTML = summaryMarkup(isEnglish ? 'Active court proceedings since 1 May 2026' : 'Aktivní soudní řízení od 1. května 2026');
  courtDetails.append(courtSummary);

  const courtBody = document.createElement('div');
  courtBody.className = 'justice-slalom-body active-courts-body';
  const intro = document.createElement('p');
  intro.className = 'justice-slalom-intro';
  intro.textContent = isEnglish
    ? `${courtRegistry.rows.length} court branches · status cross-checked between Godot decisions, Justice Slalom defence filings and the case registry.`
    : `${courtRegistry.rows.length} soudních větví · stav se křížově hlídá mezi rozhodnutími v Godotu, obranou v Justičním slalomu a registrem kauz.`;
  courtBody.append(intro);

  const scroll = document.createElement('div');
  scroll.className = 'justice-slalom-scroll active-courts-scroll';
  const table = document.createElement('table');
  table.id = isEnglish ? 'active-courts-table-en' : 'active-courts-table';
  table.className = 'active-courts-table';
  const headers = isEnglish ? courtRegistry.table_contract.columns_en : courtRegistry.table_contract.columns_cs;
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(label => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);
  const tbody = document.createElement('tbody');

  const appendLinks = (cell, links, extraClass = '') => {
    if (!Array.isArray(links) || !links.length) return;
    const box = document.createElement('div');
    box.className = `active-court-links ${extraClass}`.trim();
    links.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = isEnglish ? item.label_en : item.label_cs;
      if (/^https:\/\//i.test(item.href)) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      box.append(a);
    });
    cell.append(box);
  };

  courtRegistry.rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.courtDocketId = row.id;

    const merit = document.createElement('td');
    const heading = document.createElement('strong');
    heading.className = 'active-court-heading';
    heading.textContent = `${isEnglish ? row.court_en : row.court_cs} · ${row.reference}`;
    const annotation = document.createElement('p');
    annotation.textContent = isEnglish ? row.merit_en : row.merit_cs;
    merit.append(heading, annotation);

    const remedy = document.createElement('td');
    remedy.textContent = isEnglish ? row.remedy_en : row.remedy_cs;

    const supreme = document.createElement('td');
    supreme.textContent = isEnglish ? row.supreme_en : row.supreme_cs;

    const media = document.createElement('td');
    const mediaText = document.createElement('p');
    mediaText.textContent = isEnglish ? row.media_en : row.media_cs;
    media.append(mediaText);
    appendLinks(media, row.media_links, 'active-court-media-links');

    const published = document.createElement('td');
    appendLinks(published, row.links);

    tr.append(merit, remedy, supreme, media, published);
    tbody.append(tr);
  });
  table.append(tbody);
  scroll.append(table);
  courtBody.append(scroll);
  courtDetails.append(courtBody);
  courtShell.append(courtDetails);

  const godotTitle = isEnglish
    ? "Godot online – decisions of state and public institutions since 1 May 2026. Will the State's time for love come?"
    : 'Godot online – rozhodnutí státních a veřejných institucí od 1. května 2026. Přijde Státu lásky čas?';
  const stateLoveShell = document.querySelector('.state-love-shell');
  const stateLove = stateLoveShell?.querySelector('.state-love-panel');
  if (stateLove) {
    stateLove.classList.add('docket-controlled');
    const title = stateLove.querySelector('.rollup-title');
    const prompt = stateLove.querySelector('.rollup-prompt');
    const action = stateLove.querySelector('.rollup-action');
    if (title) title.textContent = godotTitle;
    if (prompt) prompt.textContent = isEnglish ? 'read as an investigation with love' : 'číst jako investigativu s láskou';
    if (action) action.textContent = isEnglish ? 'Expand ↓' : 'Rozbalit ↓';
    stateLoveShell.setAttribute('aria-label', isEnglish ? 'Godot online – State Love Time' : 'Godot online – Státu lásky čas');
  }

  const slalom = document.getElementById('justicni-slalom');
  const slalomShell = slalom?.closest('.justice-slalom-shell');
  if (slalom) slalom.classList.add('docket-controlled');

  const controls = document.createElement('div');
  controls.className = 'docket-bar-stack';
  controls.setAttribute('role', 'navigation');
  controls.setAttribute('aria-label', isEnglish ? 'Evidence sections' : 'Důkazní sekce');

  const specs = [
    {
      key: 'courts',
      title: isEnglish ? 'Active court proceedings since 1 May 2026' : 'Aktivní soudní řízení od 1. května 2026',
      target: courtDetails
    },
    {
      key: 'godot',
      title: godotTitle,
      target: stateLove
    },
    {
      key: 'slalom',
      title: isEnglish ? 'Justice Slalom since 1 July 2026' : 'Justiční slalom od 1. července 2026',
      target: slalom
    }
  ].filter(spec => spec.target);

  const controlsByKey = new Map();
  specs.forEach(spec => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'docket-control';
    button.dataset.docketTarget = spec.key;
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = summaryMarkup(spec.title);
    controls.append(button);
    controlsByKey.set(spec.key, button);
    button.addEventListener('click', () => {
      const wasOpen = spec.target.open;
      specs.forEach(other => { other.target.open = false; });
      if (!wasOpen) spec.target.open = true;
      syncControls();
      if (!wasOpen) wrapper.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });

  const syncControls = () => {
    specs.forEach(spec => {
      const button = controlsByKey.get(spec.key);
      if (!button) return;
      const open = Boolean(spec.target.open);
      button.setAttribute('aria-expanded', String(open));
      button.classList.toggle('is-open', open);
      const action = button.querySelector('.rollup-action');
      if (action) action.textContent = open
        ? (isEnglish ? 'Close ↑' : 'Zavřít ↑')
        : (isEnglish ? 'Expand ↓' : 'Rozbalit ↓');
    });
  };
  specs.forEach(spec => {
    spec.target.open = false;
    spec.target.addEventListener('toggle', syncControls);
  });
  syncControls();

  wrapper.append(controls, courtShell);
  if (stateLoveShell) wrapper.append(stateLoveShell);
  if (slalomShell) wrapper.append(slalomShell);

  const editionBar = document.querySelector('.edition-bar');
  const placementAnchor = editionBar || document.querySelector('.nav');
  if (!placementAnchor) return;
  if (editionBar) editionBar.replaceWith(wrapper);
  else placementAnchor.insertAdjacentElement('afterend', wrapper);
})();
