# Audit generátorů a registrů — 6. srpna 2026

## Závěr

Jediným provozním zdrojem pravdy pro dokumenty je `project-memory/documents-2026.json`. Instituce se odkazují výhradně přes `project-memory/institutions.json`, lhůty přes `project-memory/deadlines.json` a závazné zásady přes `project-memory/axioms.json`.

`project-memory/report-04082026-010-sources.json` a obdobné reportové seznamy jsou publikační manifesty konkrétních vydání. Nejsou nadřazeným registrem a nesmějí samostatně měnit název, pořadí, veřejnou cestu ani stav dokumentu.

## Zjištěné rozpory

1. `document-schema.json` používal pole `document_date`, `pdf_path`, `public_status` a ID ve formátu `DOC-*`, zatímco provozní registr a skripty používají `issue_date`, objekt `public` a ID `doc-*`.
2. `build-dynamic-chronology.mjs`, `ensure-msz-3-kzn-197-link.mjs`, `finalize-homepage.mjs` a `finalize-public-labels.mjs` postupně přepisovaly stejné HTML.
3. Reportové manifesty ukládají repozitářské cesty s prefixem `web/`; tento prefix je správný v repozitáři, ale nesmí se objevit ve veřejném URL GitHub Pages.
4. Ověřovací soubor dříve mohl potvrdit syntaktickou přítomnost odkazu bez kontroly skutečného veřejného souboru.
5. Ruční opravy výsledného HTML byly při dalším deployi přepsány generátorem.

## Nové pravidlo buildu

Ve workflow smí být jediný vstup: `node scripts/build-site.mjs`.

Tento vstup:

- načte a ověří čtyři kanonické registry;
- spustí podřízené generování chronologie, evidenčních stránek, titulní strany a lhůt;
- provede jedinou závěrečnou normalizaci názvů a veřejných cest;
- vytvoří veřejné kopie registrů v `web/data/`;
- vytvoří strojový manifest buildu;
- zastaví deploy při duplicitním ID, neznámé instituci, chybějícím lokálním PDF, cestě `web/documents/...`, chybějící chronologii nebo porušení závazných axiomů.

## Stav starších generátorů

- `build-dynamic-chronology.mjs`: zachován jako podřízený renderer dokumentů a evidenčních stránek.
- `finalize-homepage.mjs`: zachován jako podřízený renderer tří lišt.
- `build-deadlines.mjs`: zachován jako podřízený renderer lhůt.
- `ensure-msz-3-kzn-197-link.mjs`: vyřazen z produkčního workflow; zvláštní ruční výjimka již nesmí přepisovat kanonický registr.
- `finalize-public-labels.mjs`: vyřazen z produkčního workflow; jeho normalizační úlohu přebírá jediný závěrečný krok v `build-site.mjs`.
- `document-chronology.js` a `live-dockets.js`: klientské rozšíření a záložní interaktivita; nesmějí být jediným zdrojem veřejného obsahu.

## Zachované a plánované funkce

Architektura výslovně zachovává:

1. příjem místního PDF a externího HTTPS dokumentu;
2. SHA-256 a kontrolu identity dokumentu;
3. bezpečnostní a anonymizační brány před publikací;
4. pracovní skóre relevance s vysvětlením a lidskou kontrolou;
5. evidenci zákonných, sdělených a pracovních lhůt včetně odpovědi a nečinnosti;
6. interaktivní vazby dokument–řízení–instituce–právní předpis–judikatura;
7. projektovou paměť založenou pouze na dohledatelných dokumentech a označených uživatelských tvrzeních;
8. přímé veřejné odkazy na ověřené originály a pravdivé označení položek bez veřejného originálu.

## Migrační pravidlo

Nové dokumenty se zapisují pouze prostřednictvím registrace proti `documents-2026.json`. Reportový manifest se z registru odvozuje, nikoli naopak. Staré manifesty zůstávají historickým záznamem vydání.
