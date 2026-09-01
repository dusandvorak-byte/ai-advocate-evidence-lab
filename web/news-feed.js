/*
 * Jeden společný zdroj novinek pro hlavní web i Konopnou církev.
 * Nová schválená zpráva se přidává pouze sem a na vlastní stránku článku.
 */
const cannaNews = [
  {
    id: '15082026-012',
    dateCs: '15. 8. 2026',
    dateEn: '15 August 2026',
    score: '9/9',
    titleCs: 'Desatero pastýřských listů z Evropy u Ospělova',
    titleEn: 'Ten pastoral letters from Europe near Ospělov',
    summaryCs: 'Deset pastýřských listů gubernátorům protektorátu k oslavě Nanebevzetí dne 15. srpna 2026, pražské soudní termíny ve věci 45 T 1/2024 a pozvánka na Noc básníků.',
    summaryEn: 'Ten pastoral letters celebrating the Assumption on 15 August 2026, hearing dates in case 45 T 1/2024 and an invitation to the Night of Poets.',
    keywordsCs: 'Konopná církev pastýřské listy Nanebevzetí Panny Marie Ospělov Noc básníků 45 T 1/2024',
    keywordsEn: 'Church of Cannabis pastoral letters Assumption Ospelov Night of Poets 45 T 1/2024',
    href: 'zpravy/15082026-012.html',
    hrefEn: 'news/15082026-012.html'
  },
  {
    id: '07082026-011',
    dateCs: '7. 8. 2026',
    dateEn: '7 August 2026',
    score: '9/9',
    titleCs: 'Lorraine Nolan s láskou. Výzva k polibku z gubernie protektorátu Böhmen und Groß Cannabis Mähren',
    titleEn: 'To Lorraine Nolan, with love. A call to act from Böhmen und Groß Cannabis Mähren',
    summaryCs: 'EUDA byla vyzvána podle čl. 265 SFEU, aby vymezila stanovisko ke srovnatelnosti analytických metod stanovení THC a THC/THCA v členských státech EU.',
    summaryEn: 'EUDA was formally called upon under Article 265 TFEU to define its position on the comparability of THC and THC/THCA analytical methods across EU Member States.',
    keywordsCs: 'EUDA Lorraine Nolan článek 265 SFEU THC THCA analytické metody harmonizace srovnatelnost Evropská unie',
    keywordsEn: 'EUDA Lorraine Nolan Article 265 TFEU THC THCA analytical methods harmonisation comparability European Union',
    href: 'zpravy/07082026-011.html',
    hrefEn: 'news/07082026-011.html'
  },
  {
    id: '04082026-010',
    dateCs: '4. 8. 2026',
    dateEn: '4 August 2026',
    score: '9/9',
    titleCs: 'Státu lásky čas',
    titleEn: 'A time for the state to love',
    summaryCs: 'Živá chronologická mapa veřejných listin sbírky Godot on-line od května 2026; aktuální počet se odvozuje z kanonického registru.',
    summaryEn: 'A living chronological map of public records in the Godot online collection since May 2026; the current count is derived from the canonical registry.',
    keywordsCs: 'Státu lásky čas Godot chronologie dokumenty KPR NSZ NCOZ soudy státní zastupitelství 2026',
    keywordsEn: 'Godot chronology documents KPR public prosecution courts 2026',
    href: 'zpravy/04082026-010.html',
    hrefEn: 'news/04082026-010.html'
  },
  {
    id: '28072026-009',
    dateCs: '28. 7. 2026',
    dateEn: '28 July 2026',
    score: '9/9',
    titleCs: 'Lence Bradáčové s láskou on-line',
    titleEn: 'To Lenka Bradáčová, with love — online',
    summaryCs: 'Pět podání, cesta Praha–Brno–Praha a dohled nad spisem bez podstatných listin: autorský on-line důkazní deník.',
    summaryEn: 'Five filings, the Prague–Brno–Prague route and supervision of a file missing material records: an authorial online evidence diary.',
    keywordsCs: 'Lenka Bradáčová NSZ MSZ Praha MSZ Brno VSZ Praha 6 NZN 1737/2026 1 VZN 1678/2026 on-line důkazní deník',
    keywordsEn: 'Lenka Bradáčová Supreme Public Prosecutor Prague Brno 6 NZN 1737/2026 1 VZN 1678/2026 online evidence diary',
    href: 'zpravy/28072026-009.html',
    hrefEn: 'news/28072026-009.html'
  },
  {
    id: '25072026-007',
    dateCs: '25. 7. 2026',
    dateEn: '25 July 2026',
    score: '9/9',
    titleCs: 'Lence Bradáčové s láskou',
    titleEn: 'To Lenka Bradáčová, with love',
    summaryCs: 'Kytici nahradila evidenční mapa: podnět žádá přezkoumat dohled vykonaný nad neúplným spisem a přesně spojit rozdělené větve řízení.',
    summaryEn: 'An evidence map replaces the flowers: the filing asks for review of supervision conducted on an incomplete file and for an exact map of the divided proceedings.',
    keywordsCs: 'Nejvyšší státní zastupitelství NSZ 6 NZN 1737/2026 Lenka Bradáčová dohled přezkum evidenční mapa',
    keywordsEn: 'Supreme Public Prosecutor NSZ 6 NZN 1737/2026 Lenka Bradáčová supervision review evidence map',
    href: 'zpravy/25072026-007.html',
    hrefEn: 'news/25072026-007.html'
  },
  {
    id: '24072026-006',
    dateCs: '24. 7. 2026',
    dateEn: '24 July 2026',
    score: '8/9',
    titleCs: 'Konopná církev nechce zázrak. Chce rozhodnutí',
    titleEn: 'The Cannabis Church is not asking for a miracle. It wants a decision',
    summaryCs: 'Ministerstvo kultury uvedlo, že podání velmi pečlivě posuzuje a zjištěné skutečnosti i další postup sdělí do 31. srpna 2026.',
    summaryEn: 'The Ministry of Culture says it is examining the filing very carefully and will report its findings and next step by 31 August 2026.',
    keywordsCs: 'Ministerstvo kultury Konopná církev rozhodnutí 31. srpna 2026 termín žádost',
    keywordsEn: 'Ministry of Culture Cannabis Church decision 31 August 2026 date application',
    href: 'zpravy/24072026-006.html',
    hrefEn: 'news/24072026-006.html'
  },
  {
    id: '24072026-005',
    dateCs: '24. 7. 2026',
    dateEn: '24 July 2026',
    score: '7/9',
    titleCs: 'Tady někdo neumí počítat. Tři rostliny konopí nejsou šest ani sedm',
    titleEn: 'Someone cannot count. Three cannabis plants are not six or seven',
    summaryCs: 'Stížnost G. F. a J. K. namítá rozpor v počtu rostlin.',
    summaryEn: 'A complaint by G. F. and J. K. alleges a contradiction in the plant count.',
    keywordsCs: 'Okresní soud Ostrava 15 T 11/2025 rostliny konopí počet stížnost anonymizováno',
    keywordsEn: 'Ostrava District Court 15 T 11/2025 cannabis plants count complaint anonymised',
    href: 'zpravy/24072026-005.html',
    hrefEn: 'news/24072026-005.html'
  },
  {
    id: '23072026-004',
    dateCs: '23. 7. 2026',
    dateEn: '23 July 2026',
    score: '9/9',
    titleCs: 'Ministerstvo: Nemůžeme být nápomocni. Kompetenční ping-pong míří k soudu',
    titleEn: 'Ministry: We cannot assist. The jurisdictional ping-pong is heading to court',
    summaryCs: 'Zásahová žaloba napadá souhrnné vyřízení dvou obsahově odlišných stížností.',
    summaryEn: 'An intervention action challenges the combined handling of two distinct complaints.',
    keywordsCs: 'Ministerstvo vnitra zásahová žaloba Městský soud Praha kompetence stížnosti 2026',
    keywordsEn: 'Ministry of the Interior intervention action Prague Municipal Court jurisdiction complaints 2026',
    href: 'zpravy/23072026-004.html',
    hrefEn: 'news/23072026-004.html'
  },
  {
    id: '22072026-002',
    dateCs: '22. 7. 2026',
    dateEn: '22 July 2026',
    score: '8/9',
    titleCs: 'Ministerstvo zdravotnictví: bezprostředně nezasáhneme',
    titleEn: 'Ministry of Health: no immediate intervention',
    summaryCs: 'Ministerstvo zdravotnictví odmítlo bezprostředně zasáhnout do sporu o metodiku stanovení THC.',
    summaryEn: 'The Ministry of Health declined an immediate intervention in the dispute over the THC measurement methodology.',
    keywordsCs: 'Ministerstvo zdravotnictví THC metodika stanovení konopí 2026',
    keywordsEn: 'Ministry of Health THC methodology cannabis 2026',
    href: 'zpravy/22072026-002.html',
    hrefEn: 'news/22072026-002.html'
  }
];

window.cannaNews = cannaNews;
