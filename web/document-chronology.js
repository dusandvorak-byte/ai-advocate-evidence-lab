(() => {
  const ARTICLE_PATH = '/ai-advocate-evidence-lab/zpravy/04082026-010.html';
  const registryUrl = 'https://raw.githubusercontent.com/dusandvorak-byte/ai-advocate-evidence-lab/main/project-memory/documents-2026.json';
  const institutionsUrl = 'https://raw.githubusercontent.com/dusandvorak-byte/ai-advocate-evidence-lab/main/project-memory/institutions.json';
  const MAIN_FROM = '2026-05-01';
  const ARCHIVE_FROM = '2004-01-01';
  const targetInstitutionTypes = new Set(['police', 'police_lab', 'prosecution', 'ministry', 'executive_office']);

  const caseAnchors = [
    ['case-cz-os-pro-2t104-2010-obnova', 'OS Prostějov sp. zn. 2 T 104/2010 – obnova'],
    ['case-cz-os-pro-prevence-2026', 'OS Prostějov – prevence 2026'],
    ['case-cz-os-praha4-10c69-2026', 'OS Praha 4 sp. zn. 10 C 69/2026 – Česká televize'],
    ['case-cz-ms-praha-18a17-2026', 'MS v Praze sp. zn. 18 A 17/2026 – NCOZ'],
    ['case-cz-ms-praha-18a23-2026', 'MS v Praze sp. zn. 18 A 23/2026 – MSp'],
    ['case-cz-ms-praha-8ad9-2026', 'MS v Praze sp. zn. 8 Ad 9/2026 – MZ'],
    ['case-cz-ms-praha-45t1-2024', 'MS v Praze sp. zn. 45 T 1/2024 – vratka VS'],
    ['case-cz-osz-pro-prevence-2026', 'OSZ Prostějov – prevence 2026'],
    ['case-cz-pcr-prevence-prostejov-2026', 'Policie ČR – prevence Prostějov 2026'],
    ['case-cz-pcr-ku-interni-prezkum', 'Policie ČR – interní přezkum Kriminalistického ústavu'],
    ['case-cz-nsz-predzalobni-vyzva', 'NSZ – předžalobní výzva'],
    ['case-cz-vsz-praha-dohled-msz', 'VSZ Praha – dohled MSZ'],
    ['case-cz-msz-praha-prezkumy', 'MSZ Praha – přezkumy'],
    ['case-cz-vsz-olomouc-dohled-ksz-brno', 'VSZ Olomouc – dohled KSZ Brno'],
    ['case-cz-ksz-brno-prezkumy', 'KSZ Brno – přezkumy'],
    ['case-cz-kpr-tri-vetve', 'KPR – tři aktuální větve'],
    ['instituce-policie', 'Policie České republiky'],
    ['instituce-statni-zastupitelstvi', 'Státní zastupitelství'],
    ['instituce-kpr', 'Kancelář prezidenta republiky'],
    ['instituce-ministerstva', 'Ministerstva']
  ];

  const formatDate = value => {
    if (!value) return 'datum neuvedeno';
    const [year, month, day] = value.split('-');
    return `${Number(day)}. ${Number(month)}. ${year}`;
  };

  const compareDocuments = (a, b) => {
    const issue = String(a.issue_date || '').localeCompare(String(b.issue_date || ''));
    if (issue) return issue;
    const received = String(a.received_date || '').localeCompare(String(b.received_date || ''));
    if (received) return received;
    return String(a.id || '').localeCompare(String(b.id || ''));
  };

  const findChronologyList = () => {
    const heading = document.getElementById('chronologie');
    if (!heading) return null;
    let node = heading.nextElementSibling;
    while (node && node.tagName !== 'OL') node = node.nextElementSibling;
    return node;
  };

  const normalizePublicPath = value => {
    if (!value) return null;
    if (/^(?:https?:|mailto:|#|\/)/i.test(value)) return value;
    return value.replace(/^\.\//, '');
  };

  const resolveLink = (documentItem, institution) => {
    const published = documentItem.public || {};
    if (published.pdf) return { href: normalizePublicPath(published.pdf), label: 'originál PDF' };
    if (published.html) return { href: normalizePublicPath(published.html), label: 'stránka listiny' };
    if (institution && targetInstitutionTypes.has(institution.type)) {
      return { href: `listiny/${documentItem.id}.html`, label: 'stránka listiny' };
    }
    return null;
  };

  const createItem = (documentItem, institution) => {
    const item = document.createElement('li');
    item.id = documentItem.id;
    item.dataset.issueDate = documentItem.issue_date || '';
    item.dataset.institutionId = documentItem.institution_id || '';

    const institutionNode = document.createElement('span');
    institutionNode.className = 'institution';
    institutionNode.textContent = institution?.name_cs || institution?.name || documentItem.institution_id || 'Instituce neuvedena';
    item.append(institutionNode, document.createTextNode(`, ${formatDate(documentItem.issue_date)}`));
    if (documentItem.reference) item.append(document.createTextNode(`, ${documentItem.reference}`));
    if (documentItem.user_title) item.append(document.createTextNode(` — ${documentItem.user_title}`));

    const link = resolveLink(documentItem, institution);
    if (link?.href) {
      item.append(document.createTextNode(' — '));
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      if (/\.pdf(?:$|\?)/i.test(link.href)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener';
      }
      item.append(anchor);
    }
    return item;
  };

  const ensureCaseIndex = mainList => {
    document.getElementById('rizeni-online')?.remove();
    const section = document.createElement('section');
    section.id = 'rizeni-online';
    section.className = 'case-anchor-index';
    const heading = document.createElement('h3');
    heading.textContent = 'Aktivní uzly řízení';
    section.append(heading);
    for (const [id, label] of caseAnchors) {
      const node = document.createElement('article');
      node.id = id;
      node.className = 'case-anchor-node';
      const title = document.createElement('h4');
      title.textContent = label;
      const note = document.createElement('p');
      note.textContent = 'Související listiny a procesní kroky jsou průběžně řazeny v chronologii níže.';
      node.append(title, note);
      section.append(node);
    }
    mainList.before(section);
  };

  const render = (registry, institutions) => {
    const mainList = findChronologyList();
    if (!mainList || !Array.isArray(registry.documents)) return;

    const institutionEntries = Array.isArray(institutions.institutions)
      ? institutions.institutions
      : Object.values(institutions.institutions || {});
    const institutionMap = new Map(institutionEntries.map(item => [item.id, item]));
    const allDocuments = [...registry.documents]
      .filter(item => item.issue_date >= ARCHIVE_FROM)
      .sort(compareDocuments);
    const mainDocuments = allDocuments.filter(item => item.issue_date >= MAIN_FROM);
    const olderDocuments = allDocuments.filter(item => item.issue_date < MAIN_FROM);

    ensureCaseIndex(mainList);
    mainList.textContent = '';
    for (const documentItem of mainDocuments) {
      mainList.append(createItem(documentItem, institutionMap.get(documentItem.institution_id)));
    }

    const oldHeadingId = 'starsi-dokumenty';
    document.getElementById(oldHeadingId)?.remove();
    document.getElementById(`${oldHeadingId}-list`)?.remove();
    if (olderDocuments.length) {
      const heading = document.createElement('h2');
      heading.id = oldHeadingId;
      heading.textContent = `Starší dokumenty 2004–30. 4. 2026 — ${olderDocuments.length} položek`;
      const oldList = document.createElement('ol');
      oldList.id = `${oldHeadingId}-list`;
      oldList.start = mainDocuments.length + 1;
      for (const documentItem of olderDocuments) {
        oldList.append(createItem(documentItem, institutionMap.get(documentItem.institution_id)));
      }
      mainList.after(heading, oldList);
    }

    const heading = document.getElementById('chronologie');
    if (heading) heading.textContent = 'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?';

    if (location.hash) {
      requestAnimationFrame(() => {
        const target = document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView({ block: 'start' });
      });
    }
  };

  if (!location.pathname.endsWith(ARTICLE_PATH)) return;
  Promise.all([
    fetch(registryUrl, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`Rejstřík dokumentů: HTTP ${response.status}`);
      return response.json();
    }),
    fetch(institutionsUrl, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`Rejstřík institucí: HTTP ${response.status}`);
      return response.json();
    })
  ]).then(([registry, institutions]) => render(registry, institutions))
    .catch(error => {
      console.error('Dynamická chronologie nebyla načtena:', error);
      const list = findChronologyList();
      if (list) list.innerHTML = '<li>Chronologii se nepodařilo načíst. Probíhá oprava datového připojení.</li>';
    });
})();
