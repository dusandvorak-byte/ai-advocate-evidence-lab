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
})();
