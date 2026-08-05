(() => {
  const ARTICLE_PATH = 'zpravy/04082026-010.html';
  const registryUrl = 'data/documents-2026.json';
  const institutionsUrl = 'data/institutions.json';
  const MAIN_FROM = '2026-05-01';
  const ARCHIVE_FROM = '2004-01-01';
  const targetInstitutionTypes = new Set(['police', 'police_lab', 'prosecution', 'ministry', 'executive_office']);

  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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

  const collectExistingLinks = list => {
    const links = new Map();
    if (!list) return links;
    for (const item of list.querySelectorAll('li')) {
      const anchor = item.querySelector('a[href]');
      if (!anchor) continue;
      links.set(normalize(item.textContent), {
        href: anchor.getAttribute('href'),
        label: anchor.textContent.trim() || 'otevřít dokument'
      });
    }
    return links;
  };

  const findExistingLink = (documentItem, existingLinks) => {
    const reference = normalize(documentItem.reference);
    for (const [text, link] of existingLinks.entries()) {
      if (reference && text.includes(reference)) return link;
    }
    return null;
  };

  const resolveLink = (documentItem, institution, existingLinks) => {
    const published = documentItem.public || {};
    if (published.pdf) return { href: published.pdf, label: 'originál PDF' };
    if (published.html) return { href: published.html, label: 'stránka listiny' };
    const existing = findExistingLink(documentItem, existingLinks);
    if (existing) return existing;
    if (institution && targetInstitutionTypes.has(institution.type)) {
      return { href: `listiny/${documentItem.id}.html`, label: 'stránka listiny' };
    }
    return null;
  };

  const createItem = (documentItem, institution, existingLinks) => {
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

    const link = resolveLink(documentItem, institution, existingLinks);
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

  const render = (registry, institutions) => {
    const mainList = findChronologyList();
    if (!mainList || !Array.isArray(registry.documents)) return;

    const existingLinks = collectExistingLinks(mainList);
    const institutionEntries = Array.isArray(institutions.institutions)
      ? institutions.institutions
      : Object.values(institutions.institutions || {});
    const institutionMap = new Map(institutionEntries.map(item => [item.id, item]));
    const allDocuments = [...registry.documents]
      .filter(item => item.issue_date >= ARCHIVE_FROM)
      .sort(compareDocuments);
    const mainDocuments = allDocuments.filter(item => item.issue_date >= MAIN_FROM);
    const olderDocuments = allDocuments.filter(item => item.issue_date < MAIN_FROM);

    mainList.textContent = '';
    for (const documentItem of mainDocuments) {
      mainList.append(createItem(documentItem, institutionMap.get(documentItem.institution_id), existingLinks));
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
        oldList.append(createItem(documentItem, institutionMap.get(documentItem.institution_id), existingLinks));
      }
      mainList.after(heading, oldList);
    }

    const heading = document.getElementById('chronologie');
    if (heading) heading.textContent = `Pavouk řízení od 1. května 2026 — ${mainDocuments.length} dokumentů`;

    const countNodes = document.querySelectorAll('.news-meta span');
    for (const node of countNodes) {
      if (/\d+\s+dokument/i.test(node.textContent)) node.textContent = `${mainDocuments.length} dokumentů od 1. 5. 2026`;
    }

    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
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
    .catch(error => console.error('Dynamická chronologie nebyla načtena:', error));
})();
