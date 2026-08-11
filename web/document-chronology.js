(() => {
  const ARTICLE_PATH = '/ai-advocate-evidence-lab/zpravy/04082026-010.html';
  const registryUrl = 'https://raw.githubusercontent.com/dusandvorak-byte/ai-advocate-evidence-lab/main/project-memory/documents-2026.json';
  const institutionsUrl = 'https://raw.githubusercontent.com/dusandvorak-byte/ai-advocate-evidence-lab/main/project-memory/institutions.json';
  const MAIN_FROM = '2026-05-01';
  const ARCHIVE_FROM = '2004-01-01';

  // Včerejší dávka 7.–10. 8. 2026: čtyři listiny veřejných institucí,
  // tři reakce/opravné prostředky a jedna samostatná důkazní příloha.
  // Je vedena zde jako doplněk kanonického registru, dokud nebude fyzicky
  // sloučena do documents-2026.json. Stabilní ID brání duplicitám.
  const supplementalDocuments = [
    {
      id: 'doc-cz-kpr-2026-08-07-kpr-5772-2026-2',
      issue_date: '2026-08-07',
      institution_id: 'CZ-KPR',
      display_name: 'Kancelář prezidenta republiky',
      reference: 'KPR 5772/2026-2',
      user_title: 'KPR po stížnosti znovu projednala doplněnou žádost, poskytla další informace a označila postup za úplné vyhovění autoremedurou',
      submission_side: 'incoming_from_state_or_public_institution',
      public: { pdf: 'documents/report-04082026-010/15-kpr-5772-2026-2-2026-08-07.pdf', label: 'originál PDF' }
    },
    {
      id: 'doc-cz-os-pro-2026-08-07-15-nt-3105-2026-54',
      issue_date: '2026-08-07',
      institution_id: 'CZ-OS-PRO',
      display_name: 'Okresní soud v Prostějově',
      reference: '15 Nt 3105/2026-54',
      user_title: 'Soud zamítl návrh na obnovu řízení týkající se zabrání věci jako nepřípustný podle § 283 písm. b) trestního řádu',
      submission_side: 'incoming_from_state_or_public_institution',
      public: { pdf: 'documents/report-04082026-010/16-os-prostejov-15-nt-3105-2026-54-2026-08-07.pdf', label: 'originál PDF' }
    },
    {
      id: 'doc-cz-citc-2026-08-10-stiznost-kpr-5772-2026-2',
      issue_date: '2026-08-10',
      institution_id: 'CZ-CITC',
      display_name: 'Cannabis is The Cure, z. s.',
      reference: 'proti KPR 5772/2026-2',
      user_title: 'Opakovaná stížnost namítla, že KPR nevyhověla v plném rozsahu, zúžila předmět předchozí stížnosti a neúplně vypořádala evidenci souvisejících podání',
      submission_side: 'outgoing_from_user_or_alliance',
      public: { pdf: 'documents/report-04082026-010/17-citc-opakovana-stiznost-kpr-5772-2026-2-2026-08-10.pdf', label: 'opravný prostředek PDF' }
    },
    {
      id: 'doc-cz-dd-2026-08-10-stiznost-15-nt-3105-2026-54',
      issue_date: '2026-08-10',
      institution_id: 'CZ-DD',
      display_name: 'Mgr. Dušan Dvořák',
      reference: 'proti 15 Nt 3105/2026-54',
      user_title: 'Doplnění včas podané stížnosti namítlo zejména nerozhodnutí o celém rozsahu společného návrhu na obnovu a požádalo o zrušení usnesení a nové projednání',
      submission_side: 'outgoing_from_user_or_alliance',
      public: { pdf: 'documents/report-04082026-010/18-dvorak-stiznost-15-nt-3105-2026-54-2026-08-10.pdf', label: 'opravný prostředek PDF' }
    },
    {
      id: 'doc-cz-ms-pha-2026-08-10-18-a-23-2026-130',
      issue_date: '2026-08-10',
      institution_id: 'CZ-MS-PHA',
      display_name: 'Městský soud v Praze',
      reference: '18 A 23/2026-130',
      user_title: 'Výzva k zaplacení soudního poplatku 2 000 Kč do 15 dnů ve věci zásahové žaloby proti Ministerstvu spravedlnosti',
      submission_side: 'incoming_from_state_or_public_institution',
      public: { pdf: 'documents/report-04082026-010/19-ms-praha-18-a-23-2026-130-2026-08-10.pdf', label: 'originál PDF' }
    },
    {
      id: 'doc-cz-ms-pha-2026-08-10-18-a-23-2026-131',
      issue_date: '2026-08-10',
      institution_id: 'CZ-MS-PHA',
      display_name: 'Městský soud v Praze',
      reference: '18 A 23/2026-131',
      user_title: 'Výzva k vyjádření, zda žalobce souhlasí s rozhodnutím věci bez jednání podle § 51 odst. 1 s. ř. s.',
      submission_side: 'incoming_from_state_or_public_institution',
      public: { pdf: 'documents/report-04082026-010/20-ms-praha-18-a-23-2026-131-2026-08-10.pdf', label: 'originál PDF' }
    },
    {
      id: 'doc-cz-dd-2026-08-10-reakce-18-a-23-2026',
      issue_date: '2026-08-10',
      institution_id: 'CZ-DD',
      display_name: 'Mgr. Dušan Dvořák',
      reference: '18 A 23/2026',
      user_title: 'Žalobce souhlasil s rozhodnutím bez jednání, oznámil úhradu soudního poplatku a předložil nový důkaz trvání zásahu a naléhavosti bez změny petitu',
      submission_side: 'outgoing_from_user_or_alliance',
      public: { pdf: 'documents/report-04082026-010/21-dvorak-reakce-ms-praha-18-a-23-2026-2026-08-10.pdf', label: 'reakce žalobce PDF' }
    },
    {
      id: 'doc-cz-dd-2026-08-10-stiznost-necinnost-msp',
      issue_date: '2026-08-10',
      institution_id: 'CZ-DD',
      display_name: 'Mgr. Dušan Dvořák',
      reference: 'MSP-162/2026-ODKA-SPZ; MSP-19/2026-ODKA-ROZ; 18 A 23/2026',
      user_title: 'Společná stížnost ve dvou kauzách namítla nevyřízení žádosti z 12. 7. a pokračující nečinnost po stížnosti z 15. 7.; byla současně doložena soudu jako příloha k naléhavosti',
      submission_side: 'outgoing_from_user_or_alliance',
      public: { pdf: 'documents/report-04082026-010/22-dvorak-stiznost-necinnost-msp-2026-08-10.pdf', label: 'důkazní příloha PDF' }
    }
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
    return value.replace(/^\.\//, '').replace(/^web\//, '');
  };

  const resolveLink = documentItem => {
    const published = documentItem.public || {};
    if (published.pdf) return { href: normalizePublicPath(published.pdf), label: published.label || 'originál PDF' };
    if (published.html) return { href: normalizePublicPath(published.html), label: published.label || 'stránka listiny' };
    return { href: `listiny/${documentItem.id}.html`, label: 'evidenční stránka' };
  };

  const createItem = (documentItem, institution) => {
    const item = document.createElement('li');
    item.id = documentItem.id;
    item.dataset.issueDate = documentItem.issue_date || '';
    item.dataset.institutionId = documentItem.institution_id || '';
    item.dataset.submissionSide = documentItem.submission_side || '';

    const institutionNode = document.createElement('span');
    institutionNode.className = 'institution';
    institutionNode.textContent = documentItem.display_name || institution?.name_cs || institution?.name || documentItem.institution_id || 'Instituce neuvedena';

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

    document.getElementById('rizeni-online')?.remove();

    const institutionEntries = Array.isArray(institutions.institutions)
      ? institutions.institutions
      : Object.values(institutions.institutions || {});
    const institutionMap = new Map(institutionEntries.map(item => [item.id, item]));

    const mergedMap = new Map();
    for (const item of registry.documents) mergedMap.set(item.id, item);
    for (const item of supplementalDocuments) mergedMap.set(item.id, { ...(mergedMap.get(item.id) || {}), ...item });

    const allDocuments = [...mergedMap.values()]
      .filter(item => item.issue_date >= ARCHIVE_FROM)
      .sort(compareDocuments);
    const mainDocuments = allDocuments.filter(item => item.issue_date >= MAIN_FROM);
    const olderDocuments = allDocuments.filter(item => item.issue_date < MAIN_FROM);

    const stateCount = mainDocuments.filter(item => item.submission_side === 'incoming_from_state_or_public_institution' || (!item.submission_side && item.document_type === 'state_record')).length;
    const ourCount = mainDocuments.filter(item => item.submission_side === 'outgoing_from_user_or_alliance').length;

    mainList.textContent = '';
    for (const documentItem of mainDocuments) {
      mainList.append(createItem(documentItem, institutionMap.get(documentItem.institution_id)));
    }

    const meta = document.querySelector('.article-header .news-meta');
    if (meta) {
      meta.innerHTML = `<span>Od 1. května 2026</span><span>Stát: ${stateCount} evidovaných listin</span><span>Naše podání: ${ourCount}</span><span>Celkem: ${mainDocuments.length}</span><span>Autor: Mgr. Dušan Dvořák</span>`;
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
