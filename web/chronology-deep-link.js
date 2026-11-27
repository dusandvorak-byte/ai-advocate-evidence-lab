// Functional deep-link accessibility: reveal an existing row in a collapsed chronology.
// This script does not change visual design, document data, or default open state.
(() => {
  const reveal = () => {
    const raw = window.location.hash.slice(1);
    if (!raw) return;
    let id;
    try { id = decodeURIComponent(raw); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let parent = target.closest('details');
    while (parent) {
      parent.open = true;
      parent = parent.parentElement?.closest('details');
    }
    if (target.closest('details')) window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };
  window.addEventListener('hashchange', reveal);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal, { once: true });
  else reveal();
})();
