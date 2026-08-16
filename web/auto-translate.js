(() => {
  // Google already supplies its own language switcher on translated proxy pages.
  // Mounting this menu there would allow nested translation of a translation.
  if (location.hostname.endsWith('.translate.goog')) return;
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
  const sourceLanguage = document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'cs';
  const translateUrl = code => `https://translate.google.com/translate?sl=${sourceLanguage}&tl=${encodeURIComponent(code)}&u=${encodeURIComponent(location.href)}`;
  const googleWebUrl = `https://translate.google.com/?sl=${sourceLanguage}&op=websites&u=${encodeURIComponent(location.href)}`;
  const host = document.querySelector('.language-menu div') || document.querySelector('.topline') || document.body;
  if (document.querySelector('[data-machine-language-menu]')) return;

  const details = document.createElement('details');
  details.className = 'machine-language-menu';
  if (host === document.body) details.classList.add('machine-language-floating');
  details.dataset.machineLanguageMenu = '';
  details.innerHTML = `<summary aria-label="Přeložit stránku do jiného jazyka / Translate this page">🌍 Přeložit / Translate</summary><div class="machine-language-panel" role="dialog" aria-label="Jazyk / Language"><p><b>Jazyk / Language</b></p><p class="machine-translation-note">Strojový překlad slouží k orientaci. Machine translation is provided for orientation. Czech official records and PDFs remain controlling.</p><div class="machine-language-grid"></div><a class="all-machine-languages" href="${googleWebUrl}">100+ dalších jazyků / other languages →</a></div>`;
  const grid = details.querySelector('.machine-language-grid');
  for (const [code, label] of languages) {
    const link = document.createElement('a');
    link.href = translateUrl(code);
    link.lang = code;
    link.textContent = label;
    grid.append(link);
  }
  host.append(details);
})();
