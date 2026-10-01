(() => {
  const isEnglish = document.documentElement.lang === 'en';
  const cssHref = 'home-rollups.css';
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.append(link);
  }

  const brandSubtitle = document.querySelector('.masthead .brand span');
  if (brandSubtitle) {
    brandSubtitle.textContent = isEnglish
      ? 'Evidence reporter on state conduct, corruption and cannabis policy'
      : 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
  }

  const godotHref = isEnglish ? 'news/04082026-010.html' : 'zpravy/04082026-010.html';
  const konopiJeLekHref = 'https://www.konopijelek.cz/';
  const latestNews = Array.isArray(window.cannaNews) && window.cannaNews.length ? window.cannaNews[0] : null;
  const latestArticleHref = latestNews
    ? (isEnglish ? latestNews.hrefEn : latestNews.href)
    : (isEnglish ? 'news/index.html' : 'zpravy/index.html');

  // Chronologicky podle počátku právě aktivní procesní fáze.
  // V každé větvi uvádíme plný název soudu a známé spisové značky.
  const courtCases = [
    ['2025-07-29',
      'Městský soud v Praze, sp. zn. 45 T 1/2024; po vrácení Vrchním soudem v Praze, sp. zn. 11 To 88/2024',
      'Prague Municipal Court, case 45 T 1/2024; after remittal by the Prague High Court, case 11 To 88/2024',
      'case-cz-ms-praha-45t1-2024'],
    ['2026-05-01',
      'Městský soud v Praze, sp. zn. 18 A 17/2026 – zásahová žaloba proti NCOZ',
      'Prague Municipal Court, case 18 A 17/2026 – intervention action against NCOZ',
      'case-cz-ms-praha-18a17-2026'],
    ['2026-06-04',
      'Obvodní soud pro Prahu 4, sp. zn. 10 C 69/2026 – Česká televize',
      'Prague 4 District Court, case 10 C 69/2026 – Czech Television',
      'case-cz-os-praha4-10c69-2026'],
    ['2026-06-15',
      'Městský soud v Praze, sp. zn. 18 A 23/2026 – zásahová žaloba proti Ministerstvu spravedlnosti',
      'Prague Municipal Court, case 18 A 23/2026 – intervention action against the Ministry of Justice',
      'case-cz-ms-praha-18a23-2026'],
    ['2026-07-12',
      'Okresní soud v Prostějově, sp. zn. 15 Nt 3104/2026 – obnova řízení 2 T 104/2010; veřejné zasedání 12. 10. 2026',
      'Prostějov District Court, case 15 Nt 3104/2026 – reopening of 2 T 104/2010; public hearing 12 October 2026',
      'case-cz-os-pro-2t104-2010-obnova'],
    ['2026-07-12',
      'Okresní soud v Prostějově, sp. zn. 15 Nt 3106/2026 – obnova řízení 2 T 65/2011; veřejné zasedání 13. 10. 2026',
      'Prostějov District Court, case 15 Nt 3106/2026 – reopening of 2 T 65/2011; public hearing 13 October 2026',
      'doc-cz-os-pro-2026-09-14-15-nt-3106-2026'],
    ['2026-07-12',
      'Okresní soud v Prostějově – preventivní podání ze dne 12. 7. 2026; bez samostatné sp. zn. doložené v kanonickém registru',
      'Prostějov District Court – preventive filing of 12 July 2026; no separate case number documented in the canonical registry',
      'case-cz-os-pro-prevence-2026'],
    ['2026-07-22',
      'Krajský soud v Ostravě, sp. zn. 5 To 248/2026; původní věc Okresního soudu v Ostravě, sp. zn. 15 T 11/2025',
      'Ostrava Regional Court, case 5 To 248/2026; original Ostrava District Court case 15 T 11/2025',
      'chronologie'],
    ['2026-07-23',
      'Nejvyšší správní soud, sp. zn. 6 As 207/2026 – kasační stížnost; navazuje na Městský soud v Praze, sp. zn. 15 A 44/2026 proti Ministerstvu vnitra',
      'Supreme Administrative Court, case 6 As 207/2026 – cassation complaint; following Prague Municipal Court case 15 A 44/2026 against the Ministry of the Interior',
      'doc-cz-nss-2026-09-22-6-as-207-2026-26'],
    ['2026-08-31',
      'Městský soud v Praze, sp. zn. 15 Ad 14/2026 – žaloba proti SÚKL; předchozí věc proti Ministerstvu zdravotnictví sp. zn. 8 Ad 9/2026',
      'Prague Municipal Court, case 15 Ad 14/2026 – action against SÚKL; previous Ministry of Health case 8 Ad 9/2026',
      'doc-cz-ms-pha-2026-09-22-15-ad-14-2026-12'],
    ['2026-09-03',
      'Krajský soud v Brně, sp. zn. 9 To 315/2026 a 9 To 316/2026 – rozhodnuto 3. 9. 2026; připravována ústavní stížnost',
      'Brno Regional Court, cases 9 To 315/2026 and 9 To 316/2026 – decided 3 September 2026; constitutional complaint in preparation',
      'chronologie']
  ].sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

  const summaryMarkup = title =>
    `<span class="rollup-title">${title}</span><span class="rollup-prompt">${isEnglish ? 'read as an investigation with love →' : 'číst jako investigativu s láskou →'}</span><span class="rollup-heart">❤️</span><b class="rollup-action">${isEnglish ? 'Expand →' : 'Rozbalit →'}</b>`;

  const makeDetails = (title, className, body) => {
    const details = document.createElement('details');
    details.className = `home-rollup ${className}`;
    const summary = document.createElement('summary');
    summary.innerHTML = summaryMarkup(title);
    details.append(summary, body);
    return details;
  };

  const primaryNav = document.querySelector('.nav');
  const editionBar = document.querySelector('.edition-bar');
  const placementAnchor = editionBar || primaryNav;
  if (!placementAnchor) return;

  // První navigační lišta CannaInsider: právě teď = nejnovější publikovaný článek,
  // archiv zůstává, Lhůty a Ověřit listinu mizí, soudy se přesouvají sem, Podpořit zůstává.
  if (primaryNav && !document.body.classList.contains('church-site')) {
    const allAnchors = [...primaryNav.querySelectorAll(':scope > a')];
    const archiveLink = allAnchors.find(a => /Archiv zpráv|Archive/i.test(a.textContent || ''))
      || Object.assign(document.createElement('a'), { href: isEnglish ? 'news/index.html' : 'zpravy/index.html', textContent: isEnglish ? 'News archive' : 'Archiv zpráv' });
    const supportLink = allAnchors.find(a => /Podpořit|Support/i.test(a.textContent || ''))
      || Object.assign(document.createElement('a'), { href: isEnglish ? '#support' : '#podpora', textContent: isEnglish ? 'Support' : 'Podpořit' });
    const nowLink = allAnchors.find(a => /Právě teď|Right now|Now/i.test(a.textContent || ''))
      || document.createElement('a');
    nowLink.href = latestArticleHref;
    nowLink.textContent = isEnglish ? 'Right now' : 'Právě teď';
    archiveLink.href = isEnglish ? 'news/index.html' : 'zpravy/index.html';
    archiveLink.textContent = isEnglish ? 'News archive' : 'Archiv zpráv';
    supportLink.href = isEnglish ? '#support' : '#podpora';
    supportLink.textContent = isEnglish ? 'Support' : 'Podpořit';

    const courtGrid = document.createElement('div');
    courtGrid.className = 'live-docket-links nav-court-grid';
    courtCases.forEach(([startDate, labelCs, labelEn, anchor]) => {
      const card = document.createElement('article');
      card.className = 'nav-court-card';
      const link = document.createElement('a');
      link.href = `${godotHref}#${anchor}`;
      link.textContent = isEnglish ? labelEn : labelCs;
      link.dataset.startDate = startDate;
      const source = document.createElement('small');
      source.className = 'court-download-note';
      source.innerHTML = isEnglish
        ? `Actions against state authorities and applications to reopen proceedings are available for download in the header of <a href="${konopiJeLekHref}" target="_blank" rel="noopener">Konopí je lék.cz</a>.`
        : `Všechny žaloby na státní orgány a návrhy na obnovu řízení jsou uvedeny v záhlaví webu <a href="${konopiJeLekHref}" target="_blank" rel="noopener">Konopí je lék.cz</a> ke stažení.`;
      card.append(link, source);
      courtGrid.append(card);
    });

    const courtDetails = makeDetails(
      isEnglish ? 'Active court proceedings since 1 May 2026' : 'Aktivní soudní řízení od 1. května 2026',
      'court nav-court-rollup',
      courtGrid
    );
    courtDetails.id = 'active-court-proceedings';

    primaryNav.replaceChildren(nowLink, archiveLink, courtDetails, supportLink);
  }

  document.getElementById('live-dockets')?.remove();
  document.querySelector('.godot-rollup')?.remove();
  document.querySelector('.godot-rollup-link')?.remove();

  const leadSection = document.querySelector('.news-lead');
  const legacyLeadRollup = document.querySelector('.lead-rollup');
  const embeddedLeadCard = legacyLeadRollup?.querySelector('.lead-card');
  if (leadSection && embeddedLeadCard) leadSection.replaceChildren(embeddedLeadCard.cloneNode(true));
  else legacyLeadRollup?.remove();

  document.querySelector('.lead-rollup-link')?.remove();
  document.querySelector('.newsroom-alert')?.remove();

  const wrapper = document.createElement('section');
  wrapper.id = 'live-dockets';
  wrapper.className = 'live-dockets home-rollup-stack home-rollup-stack-primary';
  wrapper.setAttribute('aria-label', isEnglish ? 'Primary evidence entries' : 'Hlavní důkazní vstupy');

  const godot = document.createElement('a');
  godot.className = 'home-rollup home-rollup-link godot';
  godot.href = godotHref;
  godot.innerHTML = summaryMarkup(isEnglish ? 'Godot online → every report has a source' : 'Godot online → každá zpráva má zdroj');
  godot.setAttribute('aria-label', isEnglish ? 'Open the State Love Time chronology – Godot online' : 'Otevřít stránku Státu lásky čas – Godot online');
  wrapper.append(godot);

  const slalomShell = document.querySelector('.justice-slalom-shell');
  const slalom = slalomShell?.querySelector('#justicni-slalom');
  if (slalom) wrapper.append(slalomShell);

  if (editionBar) editionBar.replaceWith(wrapper);
  else placementAnchor.insertAdjacentElement('afterend', wrapper);
})();
