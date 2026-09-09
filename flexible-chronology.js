(() => {
  const list = document.querySelector('[data-flexible-chronology]');
  if (!list) return;
  const source = list.dataset.source;
  const csDate = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const stableId = doc => doc.id || `doc-${normalize(doc.reference || doc.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const institutionClass = institution => {
    const value = normalize(institution);
    if (/policie|ncoz|kriminalisticky ustav|krp/.test(value)) return 'institution-police';
    if (/statni zastupitelstvi|nsz|vsz|ksz|msz|osz/.test(value)) return 'institution-prosecution';
    if (/kancelar prezidenta|kpr/.test(value)) return 'institution-kpr';
    if (/ministerstvo vnitra/.test(value)) return 'institution-mv';
    if (/ministerstvo spravedlnosti|ministr spravedlnosti/.test(value)) return 'institution-msp';
    if (/ministerstvo zdravotnictvi/.test(value)) return 'institution-mz';
    return '';
  };
  fetch(source, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(payload => {
      const documents = [...payload.documents].sort((a, b) => {
        const byDate = String(a.date).localeCompare(String(b.date));
        if (byDate) return byDate;
        const byTime = String(a.time || '23:59:59').localeCompare(String(b.time || '23:59:59'));
        if (byTime) return byTime;
        return stableId(a).localeCompare(stableId(b), 'cs');
      });
      list.replaceChildren(...documents.map((doc, index) => {
        const li = document.createElement('li');
        li.id = stableId(doc);
        li.dataset.documentId = stableId(doc);
        li.dataset.date = doc.date;
        li.className = institutionClass(doc.institution);
        const heading = document.createElement('strong');
        heading.textContent = `${doc.institution}, ${csDate.format(new Date(`${doc.date}T12:00:00`))}${doc.reference ? `, č. j. ${doc.reference}` : ''}`;
        li.append(heading);
        if (doc.summary) li.append(document.createTextNode(` – ${doc.summary}`));
        if (doc.publicUrl) {
          li.append(document.createTextNode(' '));
          const link = document.createElement('a');
          link.href = doc.publicUrl;
          link.textContent = doc.linkLabel || 'Aktivní dokument';
          link.target = '_blank';
          link.rel = 'noopener';
          li.append(link);
        }
        const permalink = document.createElement('a');
        permalink.href = `#${stableId(doc)}`;
        permalink.className = 'document-permalink';
        permalink.setAttribute('aria-label', `Trvalý odkaz na položku ${index + 1}`);
        permalink.textContent = ' ¶';
        li.append(permalink);
        return li;
      }));
      const count = document.querySelector('[data-document-count]');
      if (count) count.textContent = String(documents.length);
      document.dispatchEvent(new CustomEvent('flexible-chronology:ready', { detail: { count: documents.length } }));
    })
    .catch(error => {
      list.innerHTML = `<li>Chronologii se nepodařilo načíst: ${error.message}</li>`;
    });
})();