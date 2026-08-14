(() => {
  const cssHref = 'home-rollups.css';
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.append(link);
  }

  const brandSubtitle = document.querySelector('.masthead .brand span');
  if (brandSubtitle) brandSubtitle.textContent = 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';

  const alertText = document.querySelector('.newsroom-alert span');
  if (alertText) alertText.textContent = 'Chronologický seznam dokumentů sbírky Godot on-line od 1. května 2026.';

  const leadStandfirst = document.querySelector('.lead-card .standfirst');
  if (leadStandfirst) leadStandfirst.textContent = 'Průběžná chronologická mapa rozhodnutí, vyrozumění, výzev a dalších procesních dokumentů od 1. května 2026.';

  const leadMeta = document.querySelector('.lead-card .news-meta');
  if (leadMeta) leadMeta.innerHTML = '<span>Od 1. 5. 2026</span><span>Průběžná evidence</span><span>Sbírka Godot on-line</span><span>Česká autorská verze</span>';

  const sections = [
    {
      title: 'Aktivní soudní řízení on-line od 1. května 2026', className: 'court',
      items: [
        ['OS Prostějov sp. zn. 2 T 104/2010 – obnova','zpravy/04082026-010.html#case-cz-os-pro-2t104-2010-obnova'],
        ['OS Prostějov – prevence 2026','zpravy/04082026-010.html#case-cz-os-pro-prevence-2026'],
        ['OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize','zpravy/04082026-010.html#case-cz-os-praha4-10c69-2026'],
        ['MS v Praze sp. zn. 18 A 17/2026 – NCOZ','zpravy/04082026-010.html#case-cz-ms-praha-18a17-2026'],
        ['MS v Praze sp. zn. 18 A 23/2026 – MSp','zpravy/04082026-010.html#case-cz-ms-praha-18a23-2026'],
        ['MS v Praze sp. zn. 8 Ad 9/2026 – MZ','zpravy/04082026-010.html#case-cz-ms-praha-8ad9-2026'],
        ['MS v Praze sp. zn. 45 T 1/2024 – vratka VS','zpravy/04082026-010.html#case-cz-ms-praha-45t1-2024']
      ]
    },
    {
      title: 'Předžalobní řízení on-line od 1. května 2026', className: 'pretrial',
      items: [
        ['OSZ Prostějov – prevence 2026','zpravy/04082026-010.html#case-cz-osz-pro-prevence-2026'],
        ['Policie ČR – prevence Prostějov 2026','zpravy/04082026-010.html#case-cz-pcr-prevence-prostejov-2026'],
        ['Policie ČR – interní přezkum KÚ','zpravy/04082026-010.html#case-cz-pcr-ku-interni-prezkum'],
        ['NSZ – předžalobní výzva','zpravy/04082026-010.html#case-cz-nsz-predzalobni-vyzva'],
        ['VSZ Praha – dohled MSZ','zpravy/04082026-010.html#case-cz-vsz-praha-dohled-msz'],
        ['MSZ Praha – přezkumy','zpravy/04082026-010.html#case-cz-msz-praha-prezkumy'],
        ['VSZ Olomouc – dohled KSZ Brno','zpravy/04082026-010.html#case-cz-vsz-olomouc-dohled-ksz-brno'],
        ['KSZ Brno – přezkumy','zpravy/04082026-010.html#case-cz-ksz-brno-prezkumy'],
        ['KPR – tři aktuální větve','zpravy/04082026-010.html#case-cz-kpr-tri-vetve']
      ]
    },
    {
      title: 'Státní láska online od 1. května 2026', className: 'state-love',
      items: [
        ['Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?','zpravy/04082026-010.html#chronologie'],
        ['Policie ČR – sdělení, rozhodnutí a opravné prostředky','zpravy/04082026-010.html#instituce-policie'],
        ['Státní zastupitelství – sdělení, rozhodnutí a opravné prostředky','zpravy/04082026-010.html#instituce-statni-zastupitelstvi'],
        ['Kancelář prezidenta republiky – tři větve řízení','zpravy/04082026-010.html#instituce-kpr'],
        ['Ministerstva – vnitra, spravedlnosti, zdravotnictví a kultury','zpravy/04082026-010.html#instituce-ministerstva']
      ]
    }
  ];

  const mount = document.querySelector('.edition-bar');
  let wrapper = document.getElementById('live-dockets');
  if (!wrapper && mount) {
    wrapper = document.createElement('section');
    wrapper.id = 'live-dockets';
    wrapper.className = 'live-dockets';
    wrapper.setAttribute('aria-label', 'Živá řízení a státní dokumenty');
    const counter = document.createElement('p');
    counter.className = 'state-decision-counter';
    counter.innerHTML = '<strong data-state-document-count>…</strong><span>Od 1. května 2026 stát a veřejné instituce vydaly tolik doložených rozhodnutí, sdělení a dalších procesních listin.</span>';
    wrapper.append(counter);
    for (const section of sections) {
      const bar = document.createElement('section');
      bar.className = `live-docket-bar ${section.className}`;
      bar.innerHTML = `<h2>${section.title}</h2><div class="live-docket-links"></div>`;
      const grid = bar.querySelector('.live-docket-links');
      for (const [label, href] of section.items) {
        const a = document.createElement('a'); a.href = href; a.textContent = label; grid.append(a);
      }
      wrapper.append(bar);
    }
    mount.insertAdjacentElement('afterend', wrapper);
  }

  function docketToDetails(node) {
    if (!node || node.tagName === 'DETAILS') return node;
    const heading = node.querySelector('h2');
    const links = node.querySelector('.live-docket-links');
    if (!heading || !links) return node;
    const details = document.createElement('details');
    details.className = `${node.className} home-rollup`;
    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${heading.textContent}</span><b>rozbalit</b>`;
    details.append(summary, links);
    node.replaceWith(details);
    return details;
  }

  if (wrapper) {
    [...wrapper.querySelectorAll('.live-docket-bar')].forEach(docketToDetails);
    fetch('data/documents-2026.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(registry => {
        const count = Array.isArray(registry.documents) ? registry.documents.filter(i => i.issue_date >= '2026-05-01' && i.document_type === 'state_record').length : 0;
        const node = wrapper.querySelector('[data-state-document-count]');
        if (node) node.textContent = String(count);
      }).catch(() => {});
  }

  const latest = document.getElementById('latest-records');
  if (latest && latest.tagName !== 'DETAILS') {
    const header = latest.querySelector('header');
    const grid = latest.querySelector('.latest-record-grid');
    if (header && grid) {
      const countText = header.querySelector('p:last-child')?.textContent || '';
      const today = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).replace(/\.$/, '');
      const details = document.createElement('details');
      details.id = 'latest-records';
      details.className = 'latest-records latest-records-dropdown home-rollup';
      const summary = document.createElement('summary');
      summary.innerHTML = `<span><small>NEJNOVĚJŠÍ OVĚŘENÉ LISTINY</small><strong>Kanonická důkazní paměť do ${today}</strong><em>${countText}</em></span><b>rozbalit</b>`;
      details.append(summary, grid);
      latest.replaceWith(details);
    }
  }
})();
