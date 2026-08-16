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

  const godotHref = 'zpravy/04082026-010.html';
  // Chronologicky podle počátku právě sledovaného soudního řízení.
  const courtCases = [
    ['2025-07-29', 'Městský soud v Praze, sp. zn. 45 T 1/2024 – vráceno Vrchním soudem v Praze', `${godotHref}#case-cz-ms-praha-45t1-2024`],
    ['2026-05-01', 'Městský soud v Praze, sp. zn. 18 A 17/2026 – NCOZ', `${godotHref}#case-cz-ms-praha-18a17-2026`],
    ['2026-05-31', 'Městský soud v Praze, sp. zn. 8 Ad 9/2026 – Ministerstvo zdravotnictví', `${godotHref}#case-cz-ms-praha-8ad9-2026`],
    ['2026-06-04', 'Obvodní soud pro Prahu 4, sp. zn. 10 C 69/2026 – Česká televize', `${godotHref}#case-cz-os-praha4-10c69-2026`],
    ['2026-06-15', 'Městský soud v Praze, sp. zn. 18 A 23/2026 – Ministerstvo spravedlnosti', `${godotHref}#case-cz-ms-praha-18a23-2026`],
    ['2026-07-12', 'Okresní soud v Prostějově, sp. zn. 2 T 104/2010 – obnova', `${godotHref}#case-cz-os-pro-2t104-2010-obnova`],
    ['2026-07-12', 'Okresní soud v Prostějově – prevence 2026', `${godotHref}#case-cz-os-pro-prevence-2026`],
    ['2026-07-22', 'Okresní soud v Ostravě, sp. zn. 15 T 11/2025', `${godotHref}#procesni-casovace`],
    ['2026-07-23', 'Městský soud v Praze, sp. zn. 15 A 44/2026 – Ministerstvo vnitra', 'zpravy/23072026-004.html']
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

  // Starší build obalil hlavní článek do šesté roletky. Článek je důležitý
  // zpravodajský obsah: před odstraněním staré roletky jej vždy zachováme.
  const leadSection = document.querySelector('.news-lead');
  const legacyLeadRollup = document.querySelector('.lead-rollup');
  const embeddedLeadCard = legacyLeadRollup?.querySelector('.lead-card');
  if (leadSection && embeddedLeadCard) leadSection.replaceChildren(embeddedLeadCard.cloneNode(true));
  else legacyLeadRollup?.remove();

  document.querySelector('.lead-rollup-link')?.remove();
  document.getElementById('latest-records')?.remove();
  document.querySelector('.newsroom-alert')?.remove();

  const wrapper = document.createElement('section');
  wrapper.id = 'live-dockets';
  wrapper.className = 'live-dockets home-rollup-stack home-rollup-stack-primary';
  wrapper.setAttribute('aria-label', isEnglish ? 'Three primary evidence entries' : 'Tři hlavní důkazní vstupy');

  const godot = document.createElement('a');
  godot.className = 'home-rollup home-rollup-link godot';
  godot.href = godotHref;
  godot.innerHTML = summaryMarkup(isEnglish ? 'Godot online → every report has a source' : 'Godot online → každá zpráva má zdroj');
  godot.setAttribute('aria-label', isEnglish ? 'Open the State Love Time chronology – Godot online' : 'Otevřít stránku Státu lásky čas – Godot online');
  wrapper.append(godot);

  const courtGrid = document.createElement('div');
  courtGrid.className = 'live-docket-links';
  courtCases.forEach(([startDate, label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.dataset.startDate = startDate;
    courtGrid.append(link);
  });
  wrapper.append(makeDetails(isEnglish ? 'Active court proceedings since 1 May 2026' : 'Aktivní soudní řízení od 1. května 2026', 'court', courtGrid));

  const timers = document.getElementById('procesni-casovace');
  if (timers) {
    timers.classList.add('home-rollup', 'timers-rollup');
    const summary = timers.querySelector(':scope > summary');
    if (summary) summary.innerHTML = summaryMarkup(isEnglish ? 'Live procedural timers' : 'Živé procesní časovače');
    wrapper.append(timers);
  } else if (isEnglish) {
    const timerBody = document.createElement('div');
    timerBody.className = 'rollup-body process-timers-dropdown-body';
    timerBody.innerHTML = `<a href="${godotHref}#procesni-casovace" hreflang="cs">Open the source-linked list of proceedings with running time periods →</a>`;
    const timerDetails = makeDetails('Live procedural timers', 'timers-rollup', timerBody);
    timerDetails.id = 'procesni-casovace';
    wrapper.append(timerDetails);
  }

  if (editionBar) editionBar.replaceWith(wrapper);
  else placementAnchor.insertAdjacentElement('afterend', wrapper);
})();
