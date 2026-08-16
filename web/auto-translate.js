(() => {
  const languages = [
    ['pt', 'Português'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'],
    ['it', 'Italiano'], ['pl', 'Polski'], ['uk', 'Українська'], ['ru', 'Русский'],
    ['nl', 'Nederlands'], ['sv', 'Svenska'], ['da', 'Dansk'], ['fi', 'Suomi'],
    ['ro', 'Română'], ['hu', 'Magyar'], ['sk', 'Slovenčina'], ['sl', 'Slovenščina'],
    ['hr', 'Hrvatski'], ['sr', 'Српски'], ['bg', 'Български'], ['el', 'Ελληνικά'],
    ['tr', 'Türkçe'], ['ar', 'العربية'], ['he', 'עברית'], ['fa', 'فارسی'],
    ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['id', 'Bahasa Indonesia'], ['vi', 'Tiếng Việt'],
    ['th', 'ไทย'], ['zh-CN', '中文'], ['ja', '日本語'], ['ko', '한국어']
  ];
  const translateUrl = code => `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(code)}&u=${encodeURIComponent(location.href)}`;
  const googleWebUrl = `https://translate.google.com/?sl=auto&op=websites&u=${encodeURIComponent(location.href)}`;
  const host = document.querySelector('.language-menu div') || document.querySelector('.topline');
  if (!host || document.querySelector('[data-machine-language-menu]')) return;

  const details = document.createElement('details');
  details.className = 'machine-language-menu';
  details.dataset.machineLanguageMenu = '';
  details.innerHTML = `<summary>🌍 Automatic translation</summary><div class="machine-language-panel"><p><b>Choose a language</b></p><p class="machine-translation-note">Machine translation is provided for orientation. Czech official records and PDFs remain controlling.</p><div class="machine-language-grid"></div><a class="all-machine-languages" target="_blank" rel="noopener" href="${googleWebUrl}">100+ other languages via Google Translate →</a></div>`;
  const grid = details.querySelector('.machine-language-grid');
  for (const [code, label] of languages) {
    const link = document.createElement('a');
    link.href = translateUrl(code);
    link.target = '_blank';
    link.rel = 'noopener';
    link.lang = code;
    link.textContent = label;
    grid.append(link);
  }
  host.append(details);
})();
