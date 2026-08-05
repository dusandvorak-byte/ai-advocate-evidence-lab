(() => {
  const mount = document.querySelector('.edition-bar');
  if (!mount || document.getElementById('live-dockets')) return;

  const sections = [
    {
      title: 'Aktivní soudní řízení on-line od 1. května 2026',
      className: 'court',
      items: [
        ['OS Prostějov sp. zn. 2 T 104/2010 – obnova', 'zpravy/04082026-010.html#case-cz-os-pro-2t104-2010-obnova'],
        ['OS Prostějov – prevence 2026', 'zpravy/04082026-010.html#case-cz-os-pro-prevence-2026'],
        ['OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize', 'zpravy/04082026-010.html#case-cz-os-praha4-10c69-2026'],
        ['MS v Praze sp. zn. 18 A 17/2026 – NCOZ', 'zpravy/04082026-010.html#case-cz-ms-praha-18a17-2026'],
        ['MS v Praze sp. zn. 18 A 23/2026 – MSp', 'zpravy/04082026-010.html#case-cz-ms-praha-18a23-2026'],
        ['MS v Praze sp. zn. 8 Ad 9/2026 – MZ', 'zpravy/04082026-010.html#case-cz-ms-praha-8ad9-2026'],
        ['MS v Praze sp. zn. 45 T 1/2024 – vratka VS', 'zpravy/04082026-010.html#case-cz-ms-praha-45t1-2024']
      ]
    },
    {
      title: 'Předžalobní řízení on-line od 1. května 2026',
      className: 'pretrial',
      items: [
        ['OSZ Prostějov – prevence 2026', 'zpravy/04082026-010.html#case-cz-osz-pro-prevence-2026'],
        ['Policie ČR – prevence Prostějov 2026', 'zpravy/04082026-010.html#case-cz-pcr-prevence-prostejov-2026'],
        ['Policie ČR – interní přezkum KÚ', 'zpravy/04082026-010.html#case-cz-pcr-ku-interni-prezkum'],
        ['NSZ – předžalobní výzva', 'zpravy/04082026-010.html#case-cz-nsz-predzalobni-vyzva'],
        ['VSZ Praha – dohled MSZ', 'zpravy/04082026-010.html#case-cz-vsz-praha-dohled-msz'],
        ['MSZ Praha – přezkumy', 'zpravy/04082026-010.html#case-cz-msz-praha-prezkumy'],
        ['VSZ Olomouc – dohled KSZ Brno', 'zpravy/04082026-010.html#case-cz-vsz-olomouc-dohled-ksz-brno'],
        ['KSZ Brno – přezkumy', 'zpravy/04082026-010.html#case-cz-ksz-brno-prezkumy'],
        ['KPR – tři aktuální větve', 'zpravy/04082026-010.html#case-cz-kpr-tri-vetve']
      ]
    },
    {
      title: 'Státní láska online od 1. května 2026',
      className: 'state-love',
      items: [
        ['Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?', 'zpravy/04082026-010.html#chronologie'],
        ['Policie ČR – sdělení, rozhodnutí a opravné prostředky', 'zpravy/04082026-010.html#instituce-policie'],
        ['Státní zastupitelství – sdělení, rozhodnutí a opravné prostředky', 'zpravy/04082026-010.html#instituce-statni-zastupitelstvi'],
        ['Kancelář prezidenta republiky – tři větve řízení', 'zpravy/04082026-010.html#instituce-kpr'],
        ['Ministerstva – vnitra, spravedlnosti, zdravotnictví a kultury', 'zpravy/04082026-010.html#instituce-ministerstva']
      ]
    }
  ];

  const wrapper = document.createElement('section');
  wrapper.id = 'live-dockets';
  wrapper.className = 'live-dockets';
  wrapper.setAttribute('aria-label', 'Živá řízení a státní dokumenty');

  const counter = document.createElement('p');
  counter.className = 'state-decision-counter';
  counter.innerHTML = '<strong data-state-document-count>…</strong><span>Od 1. května 2026 stát vydal tolik doložených rozhodnutí, sdělení a dalších procesních listin. Počet se téměř každý den zvyšuje.</span>';
  wrapper.append(counter);

  for (const section of sections) {
    const bar = document.createElement('section');
    bar.className = `live-docket-bar ${section.className}`;
    const heading = document.createElement('h2');
    heading.textContent = section.title;
    const grid = document.createElement('div');
    grid.className = 'live-docket-links';
    for (const [label, href] of section.items) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      grid.append(link);
    }
    bar.append(heading, grid);
    wrapper.append(bar);
  }

  mount.insertAdjacentElement('afterend', wrapper);

  fetch('data/documents-2026.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(registry => {
      const count = Array.isArray(registry.documents)
        ? registry.documents.filter(item => item.issue_date >= '2026-05-01' && item.document_type === 'state_record').length
        : 0;
      const node = wrapper.querySelector('[data-state-document-count]');
      if (node) node.textContent = String(count);
    })
    .catch(() => {
      const node = wrapper.querySelector('[data-state-document-count]');
      if (node) node.textContent = '—';
    });
})();
