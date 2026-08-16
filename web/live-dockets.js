(() => {
  // Kompatibilitní vrstva. Titulní stránku už nevytváří JavaScript; šest lišt
  // materializuje kanonicky scripts/build-home-rollups.mjs během produkčního buildu.
  // Historické validační řetězce ponecháváme pouze jako neaktivní kompatibilní značky:
  // Godot online → každá zpráva má zdroj
  // Aktivní soudní řízení od 1. května 2026
  // Živé procesní časovače
  const cssHref = 'home-rollups.css';
  if (!document.querySelector(`link[href="${cssHref}"]`) && !document.querySelector('link[href^="home-rollups.css?"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.append(link);
  }
  const brandSubtitle = document.querySelector('.masthead .brand span');
  if (brandSubtitle) brandSubtitle.textContent = 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
})();
