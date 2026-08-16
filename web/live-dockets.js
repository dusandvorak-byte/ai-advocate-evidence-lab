(() => {
  const cssHref = 'home-rollups.css';
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.append(link);
  }

  const brandSubtitle = document.querySelector('.masthead .brand span');
  if (brandSubtitle) {
    brandSubtitle.textContent = 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
  }

  const godotHref = 'zpravy/04082026-010.html';
  const courtCases = [
    ['OS Prostějov sp. zn. 2 T 104/2010 – obnova', `${godotHref}#case-cz-os-pro-2t104-2010-obnova`],
    ['OS Prostějov – prevence 2026', `${godotHref}#case-cz-os-pro-prevence-2026`],
    ['OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize', `${godotHref}#case-cz-os-praha4-10c69-2026`],
    ['MS v Praze sp. zn. 18 A 17/2026 – NCOZ', `${godotHref}#case-cz-ms-praha-18a17-2026`],
    ['MS v Praze sp. zn. 18 A 23/2026 – MSp', `${godotHref}#case-cz-ms-praha-18a23-2026`],
    ['MS v Praze sp. zn. 8 Ad 9/2026 – MZ', `${godotHref}#case-cz-ms-praha-8ad9-2026`],
    ['MS v Praze sp. zn. 45 T 1/2024 – vratka VS', `${godotHref}#case-cz-ms-praha-45t1-2024`]
  ];

  const summaryMarkup = title =>
    `<span class="rollup-title">${title}</span><span class="rollup-prompt">číst jako investigativu s láskou →</span><span class="rollup-heart">❤️</span><b class="rollup-action">Rozbalit →</b>`;

  const makeDetails = (title, className, body) => {
    const details = document.createElement('details');
    details.className = `home-rollup ${className}`;
    const summary = document.createElement('summary');
    summary.innerHTML = summaryMarkup(title);
    details.append(summary, body);
    return details;
  };

  const editionBar = document.querySelector('.edition-bar');
  if (!editionBar) return;

  document.getElementById('live-dockets')?.remove();
  document.querySelector('.godot-rollup')?.remove();
  document.querySelector('.godot-rollup-link')?.remove();
  document.querySelector('.lead-rollup')?.remove();
  document.querySelector('.lead-rollup-link')?.remove();
  document.getElementById('latest-records')?.remove();
  document.querySelector('.newsroom-alert')?.remove();

  const wrapper = document.createElement('section');
  wrapper.id = 'live-dockets';
  wrapper.className = 'live-dockets home-rollup-stack home-rollup-stack-primary';
  wrapper.setAttribute('aria-label', 'Tři hlavní důkazní vstupy');

  const godotBody = document.createElement('div');
  godotBody.className = 'rollup-body';
  godotBody.innerHTML = `<a href="${godotHref}">Otevřít stránku Státu lásky čas – Godot online →</a>`;
  wrapper.append(makeDetails('Godot online → každá zpráva má zdroj', 'godot', godotBody));

  const courtGrid = document.createElement('div');
  courtGrid.className = 'live-docket-links';
  courtCases.forEach(([label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    courtGrid.append(link);
  });
  wrapper.append(makeDetails('Aktivní soudní řízení od 1. května 2026', 'court', courtGrid));

  const timers = document.getElementById('procesni-casovace');
  if (timers) {
    timers.classList.add('home-rollup', 'timers-rollup');
    const summary = timers.querySelector(':scope > summary');
    if (summary) summary.innerHTML = summaryMarkup('Živé procesní časovače');
    wrapper.append(timers);
  }

  editionBar.insertAdjacentElement('afterend', wrapper);
})();