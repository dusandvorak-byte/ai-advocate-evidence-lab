(() => {
  const ARTICLE_PATH = '/ai-advocate-evidence-lab/zpravy/04082026-010.html';
  const registryUrl = 'data/documents-2026.json';
  const institutionsUrl = 'data/institutions.json';
  const MAIN_FROM = '2026-05-01';
  const ARCHIVE_FROM = '2004-01-01';
  const HOTFIX_DOCUMENTS = [
    {
      id: 'doc-cz-ms-pha-2026-08-19-8-ad-9-2026-80',
      user_title: 'Soud zaslal žalobci na vědomí vyjádření a doplnění vyjádření žalovaného Ministerstva zdravotnictví k zásahové žalobě',
      issue_date: '2026-08-19', received_date: '2026-08-19', institution_id: 'CZ-MS-PHA', reference: '8 Ad 9/2026-80',
      document_type: 'state_record', submission_side: 'incoming_from_state_or_public_institution',
      public: { html: 'listiny/doc-cz-ms-pha-2026-08-19-8-ad-9-2026-80.html', pdf: null }, relations: []
    },
    {
      id: 'doc-cz-dd-2026-08-20-replika-8-ad-9-2026',
      user_title: 'Replika žalobce k vyjádření a doplnění vyjádření Ministerstva zdravotnictví; návrh na naléhavé projednání bez žádosti o veřejné jednání',
      issue_date: '2026-08-20', received_date: '2026-08-20', institution_id: 'CZ-DD', reference: '8 Ad 9/2026',
      document_type: 'user_submission', submission_side: 'outgoing_from_user_or_alliance',
      public: { html: 'listiny/doc-cz-dd-2026-08-20-replika-8-ad-9-2026.html', pdf: null },
      relations: [{ type: 'reakce_na', target_id: 'doc-cz-ms-pha-2026-08-19-8-ad-9-2026-80' }]
    },
    {
      id: 'doc-cz-dd-2026-08-19-doplneni-18-a-23-2026',
      user_title: 'Mimořádně naléhavé doplnění žaloby: další listinné důkazy pokračující svévole, institucionálního obrácení odpovědnosti a trvání žalovaného zásahu',
      issue_date: '2026-08-19', received_date: '2026-08-19', institution_id: 'CZ-DD', reference: '18 A 23/2026',
      document_type: 'user_submission', submission_side: 'outgoing_from_user_or_alliance',
      public: { html: 'listiny/doc-cz-dd-2026-08-19-doplneni-18-a-23-2026.html', pdf: null },
      relations: [
        { type: 'reakce_na', target_id: 'doc-cz-ms-pha-2026-08-10-18-a-23-2026-131' },
        { type: 'souvisí', target_id: 'doc-cz-ms-pha-2026-08-10-18-a-23-2026-130' }
      ]
    },
    {
      id: 'doc-cz-fnol-2026-08-19-stl2015-11-preprava-krve',
      user_title: 'Fakultní nemocnice Olomouc poskytla k žádosti o přepravu krve doporučení STL2015_11 – Skladování a přeprava krve, krevních složek, suroviny pro další výrobu a transfuzních přípravků',
      issue_date: '2026-08-19', received_date: '2026-08-19', institution_id: 'CZ-FNOL', reference: 'STL2015_11 ze dne 2. 11. 2015; poskytnuto 19. 8. 2026',
      document_type: 'state_record', submission_side: 'incoming_from_state_or_public_institution',
      public: { html: 'listiny/doc-cz-fnol-2026-08-19-stl2015-11-preprava-krve.html', pdf: null }, relations: []
    }
  ];

  const formatDate = value => {
    if (!value) return 'datum neuvedeno';
    const [year, month, day] = value.split('-');
    return `${Number(day)}. ${Number(month)}. ${year}`;
  };
  const compareDocuments = (a, b) => String(a.issue_date || '').localeCompare(String(b.issue_date || '')) || String(a.received_date || '').localeCompare(String(b.received_date || '')) || String(a.id || '').localeCompare(String(b.id || ''));
  const compareStateDocuments = (a, b) => compareDocuments(a, b);
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
  const resolveLink = (documentItem, fallbackLabel = 'originál PDF') => {
    const published = documentItem.public || {};
    if (published.pdf) return { href: normalizePublicPath(published.pdf), label: fallbackLabel };
    if (published.html) return { href: normalizePublicPath(published.html), label: 'stránka listiny' };
    return { href: `listiny/${documentItem.id}.html`, label: 'evidenční stránka' };
  };
  const appendLink = (parent, link) => {
    parent.append(document.createTextNode(' · '));
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    if (/\.pdf(?:$|\?)/i.test(link.href)) { anchor.target = '_blank'; anchor.rel = 'noopener'; }
    parent.append(anchor);
  };
  const appendInlineDocument = (documentItem, parent, institutionMap, relationLabel) => {
    const institution = institutionMap.get(documentItem.institution_id);
    const name = institution?.name_cs || institution?.name || (documentItem.institution_id === 'CZ-DD' ? 'Mgr. Dušan Dvořák' : documentItem.institution_id || 'Původce neuveden');
    parent.append(document.createTextNode(' · '));
    const relationNode = document.createElement('strong');
    relationNode.className = 'chronology-relation-label';
    relationNode.textContent = relationLabel;
    parent.append(relationNode);
    parent.append(document.createTextNode(` Datum: ${formatDate(documentItem.issue_date)} · Kdo: `));
    const institutionNode = document.createElement('strong');
    institutionNode.textContent = name;
    parent.append(institutionNode);
    parent.append(document.createTextNode(` · Č. j. / sp. zn.: ${documentItem.reference || 'bez samostatného č. j./sp. zn.'}`));
    parent.append(document.createTextNode(` · Co se stalo: ${documentItem.user_title || 'popis úkonu dosud nedoložen'}`));
    const linkLabel = documentItem.document_type === 'user_submission_attachment' ? 'důkazní příloha PDF' : 'naše podání';
    appendLink(parent, resolveLink(documentItem, linkLabel));
  };
  const createItem = (documentItem, institution, stateResponsesByDocument, userReactionsByState, attachmentsByTarget, institutionMap) => {
    const item = document.createElement('li');
    item.id = documentItem.id;
    item.dataset.issueDate = documentItem.issue_date || '';
    item.dataset.institutionId = documentItem.institution_id || '';
    const institutionNode = document.createElement('strong');
    institutionNode.className = 'institution';
    institutionNode.textContent = institution?.name_cs || institution?.name || (documentItem.institution_id === 'CZ-FNOL' ? 'Fakultní nemocnice Olomouc' : documentItem.institution_id || 'Původce neuveden');
    item.append(document.createTextNode(`Datum: ${formatDate(documentItem.issue_date)} · Kdo: `), institutionNode);
    item.append(document.createTextNode(` · Č. j. / sp. zn.: ${documentItem.reference || 'bez samostatného č. j./sp. zn.'}`));
    item.append(document.createTextNode(` · Co se stalo: ${documentItem.user_title || 'popis úkonu dosud nedoložen'}`));
    appendLink(item, resolveLink(documentItem));
    for (const submission of [...(stateResponsesByDocument.get(documentItem.id) || [])].sort(compareDocuments)) {
      appendInlineDocument(submission, item, institutionMap, 'Reakce orgánu veřejné moci na podání:');
      for (const attachment of [...(attachmentsByTarget.get(submission.id) || [])].sort(compareDocuments)) appendInlineDocument(attachment, item, institutionMap, 'Příloha předchozího podání:');
    }
    for (const reaction of [...(userReactionsByState.get(documentItem.id) || [])].sort(compareDocuments)) {
      appendInlineDocument(reaction, item, institutionMap, 'Reakce na vyjádření orgánu veřejné moci:');
      for (const attachment of [...(attachmentsByTarget.get(reaction.id) || [])].sort(compareDocuments)) appendInlineDocument(attachment, item, institutionMap, 'Příloha následného podání:');
    }
    return item;
  };
  const render = (registry, institutions) => {
    const mainList = findChronologyList();
    if (!mainList || !Array.isArray(registry.documents)) return;
    document.getElementById('rizeni-online')?.remove();
    const institutionEntries = Array.isArray(institutions.institutions) ? institutions.institutions : Object.values(institutions.institutions || {});
    const institutionMap = new Map(institutionEntries.map(item => [item.id, item]));
    if (!institutionMap.has('CZ-FNOL')) institutionMap.set('CZ-FNOL', { id: 'CZ-FNOL', name: 'Fakultní nemocnice Olomouc' });
    const merged = new Map(registry.documents.map(item => [item.id, item]));
    for (const item of HOTFIX_DOCUMENTS) if (!merged.has(item.id)) merged.set(item.id, item);
    const allDocuments = [...merged.values()].filter(item => item.issue_date >= ARCHIVE_FROM).sort(compareDocuments);
    const mainDocuments = allDocuments.filter(item => item.issue_date >= MAIN_FROM);
    const olderDocuments = allDocuments.filter(item => item.issue_date < MAIN_FROM);
    const stateDocuments = mainDocuments.filter(item => item.submission_side === 'incoming_from_state_or_public_institution' || item.document_type === 'state_record').sort(compareStateDocuments);
    const stateById = new Map(stateDocuments.map(item => [item.id, item]));
    const outgoingDocuments = mainDocuments.filter(item => item.submission_side === 'outgoing_from_user_or_alliance');
    const allById = new Map(allDocuments.map(item => [item.id, item]));
    const outgoingById = new Map(outgoingDocuments.map(item => [item.id, item]));
    const stateResponsesByDocument = new Map();
    const userReactionsByState = new Map();
    const attachmentsByTarget = new Map();
    const addRelation = (map, targetId, documentItem) => { const bucket = map.get(targetId) || []; if (!bucket.some(item => item.id === documentItem.id)) bucket.push(documentItem); map.set(targetId, bucket); };
    for (const documentItem of allDocuments) {
      for (const rel of documentItem.relations || []) {
        const type = rel.type || rel.relation_type;
        const targetId = rel.target_id || rel.document_id;
        if (!targetId) continue;
        if (type === 'reakce_na') {
          if (outgoingById.has(documentItem.id) && stateById.has(targetId)) addRelation(userReactionsByState, targetId, documentItem);
          else if (stateById.has(documentItem.id) && outgoingById.has(targetId)) addRelation(stateResponsesByDocument, documentItem.id, allById.get(targetId));
        }
        if (type === 'priloha_k' && outgoingById.has(documentItem.id)) addRelation(attachmentsByTarget, targetId, documentItem);
      }
    }
    mainList.textContent = '';
    for (const documentItem of stateDocuments) mainList.append(createItem(documentItem, institutionMap.get(documentItem.institution_id), stateResponsesByDocument, userReactionsByState, attachmentsByTarget, institutionMap));
    const meta = document.querySelector('.article-header .news-meta');
    if (meta) meta.innerHTML = `<span>Od 1. května 2026</span><span>Stát: ${stateDocuments.length} evidovaných listin</span><span>Autor: Mgr. Dušan Dvořák</span>`;
    document.getElementById('starsi-dokumenty')?.remove();
    document.getElementById('starsi-dokumenty-list')?.remove();
    if (olderDocuments.length) {
      const heading = document.createElement('h2'); heading.id = 'starsi-dokumenty'; heading.textContent = `Starší dokumenty 2004–30. 4. 2026 — ${olderDocuments.length} položek`;
      const oldList = document.createElement('ol'); oldList.id = 'starsi-dokumenty-list'; oldList.start = stateDocuments.length + 1;
      for (const documentItem of olderDocuments) if (documentItem.submission_side === 'incoming_from_state_or_public_institution' || documentItem.document_type === 'state_record') oldList.append(createItem(documentItem, institutionMap.get(documentItem.institution_id), stateResponsesByDocument, userReactionsByState, attachmentsByTarget, institutionMap));
      const timers = document.getElementById('procesni-casovace'); if (timers) timers.after(heading, oldList); else mainList.after(heading, oldList);
    }
    const heading = document.getElementById('chronologie'); if (heading) heading.textContent = 'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?';
  };
  if (!location.pathname.endsWith(ARTICLE_PATH)) return;
  Promise.all([
    fetch(registryUrl, { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(`Publikovaný registr dokumentů: HTTP ${response.status}`); return response.json(); }),
    fetch(institutionsUrl, { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(`Publikovaný registr původců: HTTP ${response.status}`); return response.json(); })
  ]).then(([registry, institutions]) => render(registry, institutions)).catch(error => console.error('Dynamická chronologie nebyla načtena:', error));
})();
