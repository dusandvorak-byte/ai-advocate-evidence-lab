// Reveal a specific filing when an evidentiary detail page links back to it.
// Does not navigate externally or modify evidence data.
(() => {
  function revealLinkedFiling() {
    const raw = window.location.hash.slice(1);
    if (!raw) return;
    let targetId;
    try { targetId = decodeURIComponent(raw); } catch { return; }
    const target = document.getElementById(targetId);
    const disclosure = target?.closest('details[data-justice-slalom]');
    if (!disclosure) return;
    disclosure.open = true;
    target.scrollIntoView({ block: 'center' });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealLinkedFiling, { once: true });
  } else {
    revealLinkedFiling();
  }
  window.addEventListener('hashchange', revealLinkedFiling);
})();
