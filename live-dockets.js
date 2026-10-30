(async () => {
  const isEnglish = document.documentElement.lang === 'en';
  const ensureStylesheet = href => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  };
  const cssHref = 'home-rollups.css?v=732e29c7e95b';
  const liveDocketsCssHref = 'live-dockets.css?v=732e29c7e95b';
  ensureStylesheet(`/ai-advocate-evidence-lab/${cssHref}`);
  ensureStylesheet(`/ai-advocate-evidence-lab/${liveDocketsCssHref}`);

  const brandSubtitle = document.querySelector('.masthead .brand span');
  if (brandSubtitle) {
    brandSubtitle.textContent = isEnglish
      ? 'Evidence reporter on state conduct, corruption and cannabis policy'
      : 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
  }

  const registryUrl = '/ai-advocate-evidence-lab/data/active-court-dockets.json';
  let courtRegistry;
  try {
    const response = await fetch(registryUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    courtRegistry = await response.json();
  } catch (error) {
    console.error('ACTIVE_COURTS_REGISTRY_FAILED', error);
    return;
  }
  if (!Array.isArray(courtRegistry.rows) || courtRegistry.rows.length === 0) return;
  let nszTimeline = null;
  if (courtRegistry.rows.some(item => item.timeline_asset)) {
    try {
      const timelineResponse = await fetch('/ai-advocate-evidence-lab/data/nsz-prelitigation-timeline.json', {cache:'no-store'});
      if (!timelineResponse.ok) throw new Error(`HTTP ${timelineResponse.status}`);
      nszTimeline = await timelineResponse.json();
    } catch (error) {
      console.error('NSZ_PRELITIGATION_TIMELINE_FAILED',error);
    }
  }

  const publicationRows = new Map();
  try {
    const indexResponse = await fetch('/ai-advocate-evidence-lab/data/court-publication-index.json', {cache:'no-store'});
    if(!indexResponse.ok)throw new Error('HTTP '+indexResponse.status);
    const publicationIndex=await indexResponse.json();
    for(const item of publicationIndex.rows||[])publicationRows.set(item.docket_id,item);
  } catch(error) {
    console.error('COURT_PUBLICATION_INDEX_FAILED',error);
  }

  document.getElementById('live-dockets')?.remove();
  document.querySelector('.nav .nav-courts')?.remove();
  document.querySelector('.godot-rollup')?.remove();
  document.querySelector('.godot-rollup-link')?.remove();

  const leadSection = document.querySelector('.news-lead');
  const legacyLeadRollup = document.querySelector('.lead-rollup');
  const embeddedLeadCard = legacyLeadRollup?.querySelector('.lead-card');
  if (leadSection && embeddedLeadCard) leadSection.replaceChildren(embeddedLeadCard.cloneNode(true));
  else legacyLeadRollup?.remove();
  document.querySelector('.lead-rollup-link')?.remove();
  document.querySelector('.newsroom-alert')?.remove();

  const summaryMarkup = title =>
    `<span class="rollup-title">${title}</span><span class="rollup-prompt">${isEnglish ? 'read as an investigation with love' : 'číst jako investigativu s láskou'}</span><span class="rollup-heart" aria-hidden="true">❤️</span><b class="rollup-action">${isEnglish ? 'Expand ↓' : 'Rozbalit ↓'}</b>`;

  const wrapper = document.createElement('section');
  wrapper.id = 'live-dockets';
  wrapper.className = 'live-dockets home-rollup-stack home-rollup-stack-primary has-docket-controls';
  wrapper.setAttribute('aria-label', isEnglish ? 'Primary evidence entries' : 'Hlavní důkazní vstupy');

  const courtShell = document.createElement('section');
  courtShell.className = 'justice-slalom-shell court-docket-shell';
  const courtDetails = document.createElement('details');
  courtDetails.id = 'active-court-proceedings';
  courtDetails.className = 'home-rollup justice-slalom court-docket-panel docket-controlled';
  const courtSummary = document.createElement('summary');
  courtSummary.innerHTML = summaryMarkup(isEnglish ? 'Active court proceedings since 1 May 2026' : 'Aktivní soudní řízení od 1. května 2026');
  courtDetails.append(courtSummary);

  const courtBody = document.createElement('div');
  courtBody.className = 'justice-slalom-body active-courts-body';
  const intro = document.createElement('p');
  intro.className = 'justice-slalom-intro';
  intro.textContent = isEnglish
    ? `${courtRegistry.rows.length} court and explicitly identified pre-litigation branches · cross-checked between Godot, Justice Slalom and the case registry.`
    : `${courtRegistry.rows.length} soudních a výslovně označených předžalobních větví · stav se křížově hlídá mezi Godotem, Justičním slalomem a registrem kauz.`;
  courtBody.append(intro);

  const scroll = document.createElement('div');
  scroll.className = 'justice-slalom-scroll active-courts-scroll';
  const table = document.createElement('table');
  table.id = isEnglish ? 'active-courts-table-en' : 'active-courts-table';
  table.className = 'active-courts-table';
  const headers = isEnglish ? courtRegistry.table_contract.columns_en : courtRegistry.table_contract.columns_cs;
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(label => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  // One full-width document reader below the table, inside Active Courts.
  // Evidence buttons remain in each court's final column.
  const selectedDocuments = document.createElement('section');
  selectedDocuments.className = 'active-court-selected-documents';
  selectedDocuments.hidden = true;
  let activeEvidenceButton = null;
  const showEvidence = (button, content, title) => {
    if (activeEvidenceButton === button && !selectedDocuments.hidden) {
      selectedDocuments.hidden = true;
      selectedDocuments.replaceChildren();
      button.setAttribute('aria-expanded', 'false');
      activeEvidenceButton = null;
      return;
    }
    if (activeEvidenceButton) activeEvidenceButton.setAttribute('aria-expanded', 'false');
    const heading = document.createElement('h3');
    heading.className = 'active-court-evidence-heading';
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'active-court-evidence-close';
    close.textContent = isEnglish ? 'Close document lists ↑' : 'Zavřít seznamy listin ↑';
    close.addEventListener('click', () => {
      selectedDocuments.hidden = true;
      selectedDocuments.replaceChildren();
      button.setAttribute('aria-expanded', 'false');
      activeEvidenceButton = null;
    });
    selectedDocuments.replaceChildren(heading, close, content);
    selectedDocuments.hidden = false;
    activeEvidenceButton = button;
    button.setAttribute('aria-expanded', 'true');
    selectedDocuments.scrollIntoView({block:'nearest',behavior:'auto'});
  };

  const appendLinks = (cell, links, extraClass = '') => {
    if (!Array.isArray(links) || !links.length) return;
    const box = document.createElement('div');
    box.className = `active-court-links ${extraClass}`.trim();
    links.forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = isEnglish ? item.label_en : item.label_cs;
      if (/^https:\/\//i.test(item.href)) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      box.append(a);
    });
    cell.append(box);
  };

  courtRegistry.rows.forEach(row => {
    let nszDetail = null;
    const tr = document.createElement('tr');
    tr.dataset.courtDocketId = row.id;

    const merit = document.createElement('td');
    const heading = document.createElement('strong');
    heading.className = 'active-court-heading';
    heading.textContent = `${isEnglish ? row.court_en : row.court_cs} · ${row.reference}`;
    const annotation = document.createElement('p');
    annotation.textContent = isEnglish ? row.merit_en : row.merit_cs;
    merit.append(heading, annotation);

    if (row.timeline_asset) {
      const disclosure = document.createElement('details');
      disclosure.className = 'active-nsz-timeline';
      const summary = document.createElement('summary');
      const count = nszTimeline?.counts?.total;
      summary.textContent = isEnglish
        ? `Show recorded NSZ documents, my filings and archival references${Number.isInteger(count) ? ` (${count})` : ''} ↓`
        : `Rozbalit listiny NSZ, moje podání a archivní záznamy${Number.isInteger(count) ? ` (${count})` : ''} ↓`;
      disclosure.append(summary);
      if (nszTimeline && nszTimeline.case_id === 'CASE-CZ-NSZ-6NZN1737-2026') {
        for (const group of nszTimeline.groups || []) {
          const section = document.createElement('section');
          section.className = 'active-nsz-group';
          const heading = document.createElement('h4');
          heading.textContent = `${isEnglish ? group.title_en : group.title_cs} · ${group.items.length}`;
          section.append(heading);
          const list = document.createElement('ol');
          for (const item of group.items) {
            const li = document.createElement('li');
            const stamp = document.createElement('strong');
            stamp.textContent = `${item.date} · ${item.reference || '–'} · `;
            li.append(stamp);
            const title = isEnglish ? (item.description_en || item.title_cs) : item.title_cs;
            if (item.href) {
              const link = document.createElement('a');
              link.href = item.href;
              link.textContent = title;
              li.append(link);
              const format = document.createElement('small');
              format.textContent = item.link_kind === 'pdf'
                ? (isEnglish ? ' · PDF document' : ' · Dokument v PDF')
                : item.link_kind === 'archive'
                  ? (isEnglish ? ' · Archive report (not a standalone filing PDF)' : ' · Archivní článek (nikoli samostatné PDF podání)')
                  : (isEnglish ? ' · Evidence page' : ' · Evidenční stránka');
              li.append(format);
            } else {
              li.append(document.createTextNode(title));
              const missing = document.createElement('small');
              missing.textContent = isEnglish ? ' · No public file on record' : ' · Veřejný soubor není doložen';
              li.append(missing);
            }
            list.append(li);
          }
          section.append(list);
          disclosure.append(section);
        }
        const provenance = document.createElement('p');
        provenance.className = 'active-nsz-provenance';
        provenance.textContent = isEnglish ? nszTimeline.provenance_note_en : nszTimeline.provenance_note_cs;
        disclosure.append(provenance);
      } else {
        const missing = document.createElement('p');
        missing.textContent = isEnglish
          ? 'The document chronology could not be loaded; use the NSZ case archive link.'
          : 'Chronologii se nepodařilo načíst; použijte odkaz na archiv kauzy NSZ.';
        disclosure.append(missing);
      }
      nszDetail = disclosure;
      // All 29 NSZ entries are preserved; the full-width reader shows them.
      disclosure.open = true;
      summary.hidden = true;
    }

    const remedy = document.createElement('td');
    remedy.textContent = isEnglish ? row.remedy_en : row.remedy_cs;

    const supreme = document.createElement('td');
    supreme.textContent = isEnglish ? row.supreme_en : row.supreme_cs;

    const media = document.createElement('td');
    const mediaText = document.createElement('p');
    mediaText.textContent = isEnglish ? row.media_en : row.media_cs;
    media.append(mediaText);
    appendLinks(media, row.media_links, 'active-court-media-links');

    const published = document.createElement('td');
    appendLinks(published, row.links);
    if (nszDetail) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active-case-publications-toggle';
      const count = nszTimeline?.counts?.total;
      button.textContent = isEnglish
        ? `NSZ documents, submissions and archive (${count ?? 29}) ↓`
        : `Listiny NSZ, podání a archiv (${count ?? 29}) ↓`;
      button.setAttribute('aria-expanded','false');
      published.append(button);
      button.addEventListener('click', () => showEvidence(
        button, nszDetail,
        isEnglish ? 'NSZ: all 29 preserved records' : 'NSZ: všech 29 zachovaných záznamů'
      ));
    }

    const publication = publicationRows.get(row.id);
    if (publication && !nszDetail) {
      // Lists are opened in the full-width reader, never extra table rows.
      // itself inside the existing Active Courts top-level roll-up.  Never
      // create additional table rows for a long list of submissions.
      const details = document.createElement('details');
      details.className = 'active-case-publications';
      const summary = document.createElement('summary');
      summary.className = 'active-case-publications-toggle';
      summary.hidden = true;
      summary.textContent = isEnglish
        ? `All documents in this case (${publication.counts.total}) ↓`
        : `Vše v této kauze (${publication.counts.total}) ↓`;
      details.append(summary);

      const panel = document.createElement('div');
      panel.className = 'active-case-publications-panel';
      const externalLabel = document.createElement('p');
      externalLabel.className = 'active-case-external-source';
      externalLabel.append(document.createTextNode(isEnglish
        ? 'External case archive on Konopí je lék.cz (Cannabis is The Cure.cz): '
        : 'Externí archiv kauzy na Konopí je lék.cz (Cannabis is The Cure.cz): '));
      if (publication.external_archive_url) {
        const external = document.createElement('a');
        external.href = publication.external_archive_url;
        external.textContent = 'Konopí je lék.cz ↗';
        external.target = '_blank';
        external.rel = 'noopener';
        externalLabel.append(external);
      }
      panel.append(externalLabel);

      const groups = document.createElement('div');
      groups.className = 'active-case-publication-groups';
      for (const group of publication.groups || []) {
        const section = document.createElement('section');
        const heading = document.createElement('h4');
        heading.textContent = `${isEnglish ? group.label_en : group.label_cs} (${group.items.length})`;
        section.append(heading);
        const list = document.createElement('ol');
        for (const item of group.items || []) {
          const li = document.createElement('li');
          const link = document.createElement('a');
          link.href = item.href;
          link.textContent = `${item.date} · ${item.institution} · ${item.reference}`;
          if (/^https:\/\//i.test(item.href)) {
            link.target = '_blank';
            link.rel = 'noopener';
          }
          li.append(link);
          list.append(li);
        }
        if (!group.items?.length) {
          const empty = document.createElement('p');
          empty.textContent = isEnglish
            ? 'No directly published documents are recorded.'
            : 'Nejsou evidovány přímo zveřejněné dokumenty.';
          section.append(empty);
        }
        section.append(list);
        groups.append(section);
      }
      panel.append(groups);
      details.append(panel);
      details.open = true;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active-case-publications-toggle';
      button.textContent = isEnglish
        ? `Document lists (${publication.counts.total}) ↓`
        : `Seznamy listin (${publication.counts.total}) ↓`;
      button.setAttribute('aria-expanded', 'false');
      published.append(button);
      button.addEventListener('click', () => showEvidence(
        button, details,
        `${isEnglish ? row.court_en : row.court_cs} · ${row.reference}`
      ));
    }
    tr.append(merit, remedy, supreme, media, published);
    tbody.append(tr);
  });
  table.append(tbody);
  scroll.append(table);
  courtBody.append(scroll, selectedDocuments);
  courtDetails.append(courtBody);
  courtShell.append(courtDetails);

  const godotTitle = isEnglish
    ? "Godot online – decisions of state and public institutions since 1 May 2026. Will the State's time for love come?"
    : 'Godot online – rozhodnutí státních a veřejných institucí od 1. května 2026. Přijde Státu lásky čas?';
  const stateLoveShell = document.querySelector('.state-love-shell');
  const stateLove = stateLoveShell?.querySelector('.state-love-panel');
  if (stateLove) {
    stateLove.classList.add('docket-controlled');
    const title = stateLove.querySelector('.rollup-title');
    const prompt = stateLove.querySelector('.rollup-prompt');
    const action = stateLove.querySelector('.rollup-action');
    if (title) title.textContent = godotTitle;
    if (prompt) prompt.textContent = isEnglish ? 'read as an investigation with love' : 'číst jako investigativu s láskou';
    if (action) action.textContent = isEnglish ? 'Expand ↓' : 'Rozbalit ↓';
    stateLoveShell.setAttribute('aria-label', isEnglish ? 'Godot online – State Love Time' : 'Godot online – Státu lásky čas');
  }

  const slalom = document.getElementById('justicni-slalom');
  const slalomShell = slalom?.closest('.justice-slalom-shell');
  if (slalom) slalom.classList.add('docket-controlled');

  const controls = document.createElement('div');
  controls.className = 'docket-bar-stack';
  controls.setAttribute('role', 'navigation');
  controls.setAttribute('aria-label', isEnglish ? 'Evidence sections' : 'Důkazní sekce');

  const specs = [
    {
      key: 'courts',
      title: isEnglish ? 'Active court proceedings since 1 May 2026' : 'Aktivní soudní řízení od 1. května 2026',
      target: courtDetails
    },
    {
      key: 'godot',
      title: godotTitle,
      target: stateLove
    },
    {
      key: 'slalom',
      title: isEnglish ? 'Justice Slalom since 1 July 2026' : 'Justiční slalom od 1. července 2026',
      target: slalom
    }
  ].filter(spec => spec.target);

  const controlsByKey = new Map();
  specs.forEach(spec => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'docket-control';
    button.dataset.docketTarget = spec.key;
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = summaryMarkup(spec.title);
    controls.append(button);
    controlsByKey.set(spec.key, button);
    button.addEventListener('click', () => {
      const wasOpen = spec.target.open;
      specs.forEach(other => { other.target.open = false; });
      if (!wasOpen) spec.target.open = true;
      syncControls();
      if (!wasOpen) wrapper.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });

  const syncControls = () => {
    specs.forEach(spec => {
      const button = controlsByKey.get(spec.key);
      if (!button) return;
      const open = Boolean(spec.target.open);
      button.setAttribute('aria-expanded', String(open));
      button.classList.toggle('is-open', open);
      const action = button.querySelector('.rollup-action');
      if (action) action.textContent = open
        ? (isEnglish ? 'Close ↑' : 'Zavřít ↑')
        : (isEnglish ? 'Expand ↓' : 'Rozbalit ↓');
    });
  };
  specs.forEach(spec => {
    spec.target.open = false;
    spec.target.addEventListener('toggle', syncControls);
  });
  syncControls();

  wrapper.append(controls, courtShell);
  if (stateLoveShell) wrapper.append(stateLoveShell);
  if (slalomShell) wrapper.append(slalomShell);

  const editionBar = document.querySelector('.edition-bar');
  const placementAnchor = editionBar || document.querySelector('.nav');
  if (!placementAnchor) return;
  if (editionBar) editionBar.replaceWith(wrapper);
  else placementAnchor.insertAdjacentElement('afterend', wrapper);
})();
