(() => {
  const ARTICLE_PATH = 'zpravy/04082026-010.html';
  const registryUrl = 'data/documents-2026.json';
  const institutionsUrl = 'data/institutions.json';

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
      const text = normalize(item.textContent);
      const anchor = item.querySelector('a[href]');
      if (!anchor) continue;
      links.set(text, {
        href: anchor.getAttribute('href'),
        label: anchor.textContent.trim() || 'otevřít dokument'
      });
    }
    return links;
  };

  const resolveInstitutionName = (documentItem, institutionMap) => {
    const entry = institutionMap.get(documentItem.institution_id);
    return entry?.name_cs || entry?.name || documentItem.institution_id || 'Instituce neuvedena';
  };

  const findExistingLink = (documentItem, existingLinks) => {
    const reference = normalize(documentItem.reference);
    for (const [text, link] of existingLinks.entries()) {
      if (reference && text.includes(reference)) return link;
    }
    return null;
  };

  const publicLink = (documentItem, existingLinks) => {
    const published = documentItem.public || {};
    if (published.html) return { href: published.html, label: 'stránka listiny' };
    if (published.pdf) return { href: published.pdf, label: 'originál PDF' };
    return findExistingLink(documentItem, existingLinks);
  };

  const render = (registry, institutions) => {
    const list = findChronologyList();
    if (!list || !Array.isArray(registry.documents)) return;

    const existingLinks = collectExistingLinks(list);
    const institutionEntries = Array.isArray(institutions.institutions)
      ? institutions.institutions
      : Object.values(institutions.institutions || {});
    const institutionMap = new Map(institutionEntries.map(item => [item.id, item]));
    const documents = [...registry.documents].sort(compareDocuments);

    list.textContent = '';
    documents.forEach(documentItem => {
      const item = document.createElement('li');
      item.id = documentItem.id;
      item.dataset.issueDate = documentItem.issue_date || '';
      item.dataset.institutionId = documentItem.institution_id || '';

      const institution = document.createElement('span');
      institution.className = 'institution';
      institution.textContent = resolveInstitutionName(documentItem, institutionMap);
      item.append(institution, document.createTextNode(`, ${formatDate(documentItem.issue_date)}`));

      if (documentItem.reference) {
        item.append(document.createTextNode(`, ${documentItem.reference}`));
      }
      if (documentItem.user_title) {
        item.append(document.createTextNode(` — ${documentItem.user_title}`));
      }

      const link = publicLink(documentItem, existingLinks);
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
      list.append(item);
    });

    const heading = document.getElementById('chronologie');
    if (heading) heading.textContent = `Pavouk řízení — ${documents.length} dokumentů`;

    const countNodes = document.querySelectorAll('.news-meta span');
    for (const node of countNodes) {
      if (/\d+\s+dokument/i.test(node.textContent)) node.textContent = `${documents.length} dokumentů`;
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
