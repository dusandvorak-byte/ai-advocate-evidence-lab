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
  // Chronologicky podle počátku právě aktivní procesní fáze.
  // Každá větev uvádí plný název soudu a známé spisové značky.
  const courtCases = [
    ['2025-07-29', 'Městský soud v Praze, sp. zn. 45 T 1/2024 – věc vrácena Vrchním soudem v Praze', 'Prague Municipal Court, case 45 T 1/2024 – returned by the Prague High Court', 'case-cz-ms-praha-45t1-2024'],
    ['2026-05-01', 'Městský soud v Praze, sp. zn. 18 A 17/2026 – zásahová žaloba proti NCOZ', 'Prague Municipal Court, case 18 A 17/2026 – intervention action against the National Centre against Organised Crime', 'case-cz-ms-praha-18a17-2026'],
    ['2026-06-04', 'Obvodní soud pro Prahu 4, sp. zn. 10 C 69/2026 – Česká televize', 'Prague 4 District Court, case 10 C 69/2026 – Czech Television', 'case-cz-os-praha4-10c69-2026'],
    ['2026-06-15', 'Městský soud v Praze, sp. zn. 18 A 23/2026 – zásahová žaloba proti Ministerstvu spravedlnosti', 'Prague Municipal Court, case 18 A 23/2026 – intervention action against the Ministry of Justice', 'case-cz-ms-praha-18a23-2026'],
    ['2026-07-12', 'Okresní soud v Prostějově, sp. zn. 2 T 104/2010 / 15 Nt 3104/2026 – návrh na obnovu řízení', 'Prostějov District Court, case 2 T 104/2010 / 15 Nt 3104/2026 – application to reopen proceedings', 'case-cz-os-pro-2t104-2010-obnova'],
    ['2026-07-12', 'Okresní soud v Prostějově, sp. zn. 2 T 65/2011 / 15 Nt 3106/2026 – návrh na obnovu řízení', 'Prostějov District Court, case 2 T 65/2011 / 15 Nt 3106/2026 – application to reopen proceedings', 'case-cz-os-pro-2t65-2011-obnova'],
    ['2026-08-24', 'Krajský soud v Ostravě, sp. zn. 5 To 248/2026; původní věc: Okresní soud v Ostravě, sp. zn. 15 T 11/2025', 'Ostrava Regional Court, case 5 To 248/2026; original Ostrava District Court case 15 T 11/2025', 'case-cz-os-ostrava-15t11-2025'],
    ['2026-08-31', 'Městský soud v Praze, sp. zn. 15 Ad 14/2026 – zásahová žaloba proti SÚKL; předchozí věc proti Ministerstvu zdravotnictví sp. zn. 8 Ad 9/2026', 'Prague Municipal Court, case 15 Ad 14/2026 – intervention action against SÚKL; previous Ministry of Health case 8 Ad 9/2026', 'chronologie'],
    ['2026-09-01', 'Nejvyšší správní soud, sp. zn. 6 As 207/2026 – kasační stížnost; předchozí Městský soud v Praze sp. zn. 15 A 44/2026', 'Supreme Administrative Court, case 6 As 207/2026 – cassation complaint; previous Prague Municipal Court case 15 A 44/2026', 'case-cz-ms-praha-15a44-2026'],
    ['2026-09-03', 'Krajský soud v Brně, sp. zn. 9 To 315/2026 a 9 To 316/2026 – rozhodnuto 3. 9. 2026; připravována ústavní stížnost', 'Brno Regional Court, cases 9 To 315/2026 and 9 To 316/2026 – decided on 3 September 2026; a constitutional complaint is being prepared', 'chronologie']
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

  const editionBar = document.querySelector('.edition-bar');
  const placementAnchor = editionBar || document.querySelector('.nav');
  if (!placementAnchor) return;

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

  const nav = document.querySelector('.nav');
  nav?.querySelector('.nav-courts')?.remove();
  if (nav) {
    const courtDetails = document.createElement('details');
    courtDetails.className = 'nav-courts';
    const courtSummary = document.createElement('summary');
    courtSummary.innerHTML = `<span class="nav-courts-title">${isEnglish ? 'Active court proceedings since 1 May 2026' : 'Aktivní soudní řízení od 1. května 2026'}</span><span class="nav-courts-prompt">${isEnglish ? 'read as an investigation with love →' : 'číst jako investigativu s láskou →'}</span><span aria-hidden="true">❤️</span><b>${isEnglish ? 'Expand →' : 'Rozbalit →'}</b>`;
    courtDetails.append(courtSummary);
    const courtPanel = document.createElement('div');
    courtPanel.className = 'nav-courts-panel';
    const sourceText = isEnglish
      ? 'All actions against state authorities and applications to reopen proceedings are available for download in the header of'
      : 'Všechny žaloby na státní orgány a návrhy na obnovu řízení jsou uvedeny v záhlaví webových stránek';
    courtCases.forEach(([startDate, labelCs, labelEn, anchor]) => {
      const item = document.createElement('div');
      item.className = 'nav-court-item';
      item.dataset.startDate = startDate;
      const link = document.createElement('a');
      link.href = `${godotHref}#${anchor}`;
      link.textContent = isEnglish ? labelEn : labelCs;
      const note = document.createElement('span');
      note.className = 'court-download-note';
      note.append(document.createTextNode(sourceText + ' '));
      const source = document.createElement('a');
      source.href = 'https://www.konopijelek.cz/';
      source.target = '_blank';
      source.rel = 'noopener';
      source.textContent = isEnglish ? 'Cannabis is The Cure.cz →' : 'Konopí je lék.cz →';
      note.append(source);
      note.append(document.createTextNode(isEnglish ? '.' : ' ke stažení.'));
      item.append(link, note);
      courtPanel.append(item);
    });
    courtDetails.append(courtPanel);
    const support = [...nav.querySelectorAll('a')].find(link => /^(Podpořit|Support)$/.test(link.textContent.trim()));
    if (support) nav.insertBefore(courtDetails, support);
    else nav.append(courtDetails);
  }

  const slalomShell = document.querySelector('.justice-slalom-shell');
  const slalom = slalomShell?.querySelector('#justicni-slalom');
  if (slalom) wrapper.append(slalomShell);

  if (editionBar) editionBar.replaceWith(wrapper);
  else placementAnchor.insertAdjacentElement('afterend', wrapper);
})();
