(() => {
  const MS_DAY = 86400000;
  const calendarDayUtc = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const parseDayUtc = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const today = calendarDayUtc(new Date());

  document.querySelectorAll('[data-process-timer]').forEach(node => {
    const start = parseDayUtc(node.dataset.startDate);
    const elapsedNode = node.querySelector('[data-elapsed-days]');
    if (!elapsedNode) return;
    if (start === null) {
      elapsedNode.textContent = '—';
      node.classList.add('timer-start-unverified');
      return;
    }
    const end = parseDayUtc(node.dataset.endDate);
    const stop = end === null ? today : Math.min(today, end);
    elapsedNode.textContent = String(Math.max(0, Math.floor((stop - start) / MS_DAY)));
  });

  const priorityIds = [
    'timer-admin-kpr-repeat-16a-2026-08-10',
    'timer-admin-msz-stiznost-necinnost-2026-07-31',
    'timer-admin-msz-odvolani-sin48-2026',
    'timer-admin-nsz-odvolani-sin55-2026',
    'timer-admin-mv-rozklad-127234-2026'
  ];

  document.querySelectorAll('.process-timers').forEach(root => {
    const body = root.querySelector('.process-timers-dropdown-body') || root;
    if (body.querySelector('[data-timer-category="current-remedies"]')) return;

    const cards = priorityIds
      .map(id => body.querySelector(`[data-timer-id="${id}"]`))
      .filter(Boolean);
    if (!cards.length) return;

    const section = document.createElement('section');
    section.className = 'timer-category timer-category-priority';
    section.dataset.timerCategory = 'current-remedies';

    const heading = document.createElement('h3');
    heading.innerHTML = `Aktuální stížnosti, odvolání a rozklad <span class="timer-category-count">(${cards.length})</span>`;

    const grid = document.createElement('div');
    grid.className = 'timer-grid';
    cards.forEach(card => grid.append(card));
    section.append(heading, grid);

    const legend = body.querySelector('.timer-legend');
    if (legend) legend.insertAdjacentElement('afterend', section);
    else body.prepend(section);
  });
})();
