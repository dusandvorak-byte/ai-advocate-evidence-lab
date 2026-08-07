(() => {
  const ARTICLE_PATH = '/ai-advocate-evidence-lab/zpravy/04082026-010.html';
  const registryUrl = 'https://raw.githubusercontent.com/dusandvorak-byte/ai-advocate-evidence-lab/main/project-memory/documents-2026.json';
  const institutionsUrl = 'https://raw.githubusercontent.com/dusandvorak-byte/ai-advocate-evidence-lab/main/project-memory/institutions.json';
  const MAIN_FROM = '2026-05-01';
  const ARCHIVE_FROM = '2004-01-01';

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

  const resolveLink = documentItem => {
    const published = documentItem.public || {};
    if (published.pdf) return { href: normalizePublicPath(published.pdf), label: 'originál PDF' };
    if (published.html) return { href: normalizePublicPath(published.html), label: 'stránka listiny' };
    return { href: `listiny/${documentItem.id}.html`, label: 'evidenční stránka' };
  };

  const createItem = (documentItem, institution) => {
    const item = document.createElement('li');
    item.id = documentItem.id;
    item.dataset.issueDate = documentItem.issue_date || '';
    item.dataset.institutionId = documentItem.institution_id || '';

    const institutionNode = document.createElement('span');
    institutionNode.className = 'institution';
    institutionNode.textContent = institution?.name_cs || institution?.name || documentItem.institution_id || 'Instituce neuvedena';

    item.append(document.createTextNode('Kdo: '), institutionNode);
    item.append(document.createTextNode(` · Datum: ${formatDate(documentItem.issue_date)}`));
    item.append(document.createTextNode(` · Č. j. / sp. zn.: ${documentItem.reference || 'bez samostatného č. j./sp. zn.'}`));
    item.append(document.createTextNode(` · Co se stalo: ${documentItem.user_title || 'popis úkonu dosud nedoložen'}`));

    const link = resolveLink(documentItem);
    item.append(document.createTextNode(' · '));
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    if (/\.pdf(?:$|\?)/i.test(link.href)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener';
    }
    item.append(anchor);
    return item;
  };

  const render = (registry, institutions) => {
    const mainList = findChronologyList();
    if (!mainList || !Array.isArray(registry.documents)) return;

    // Duplicitní blok „Aktivní uzly řízení“ se v Godotovi nepoužívá.
    document.getElementById('rizeni-online')?.remove();

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
      const timers = document.getElementById('procesni-casovace');
      if (timers) timers.after(heading, oldList);
      else mainList.after(heading, oldList);
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
