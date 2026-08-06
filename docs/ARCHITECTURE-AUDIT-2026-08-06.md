# Audit generátorů a registrů

Datum: 6. srpna 2026

## Závěr

Jediným autoritativním registrem dokumentů je `project-memory/documents-2026.json`. Každý dokument musí mít právě jeden stabilní identifikátor, datum, instituci, typ, procesní vazby a veřejné umístění. HTML články, evidenční stránky, chronologie, titulní lišty a veřejné datové kopie jsou výstupy buildu a nesmějí být druhým zdrojem pravdy.

Doplňkové registry mají úzkou působnost a nesmějí duplikovat dokumenty:

- `project-memory/institutions.json` — číselník institucí;
- `project-memory/report-04082026-010-sources.json` — audit původu a fyzických souborů konkrétní publikace, nikoli samostatný katalog dokumentů;
- registry lhůt — pouze doložené termíny, jejich zdroj a stav kontroly;
- budoucí registry judikatury a právních předpisů — samostatné znalostní zdroje propojené stabilními ID, nikoli kopie dokumentové evidence.

## Nalezené generátory

1. `scripts/build-dynamic-chronology.mjs` — vytváří veřejnou chronologii, evidenční stránky a veřejné kopie registrů.
2. `scripts/ensure-msz-3-kzn-197-link.mjs` — dodatečně přepisuje jeden konkrétní dokument a části titulní stránky.
3. `scripts/finalize-homepage.mjs` — dodatečně vkládá tři lišty.
4. `scripts/finalize-public-labels.mjs` — dodatečně přepisuje názvy a cesty.
5. `scripts/build-deadlines.mjs` — sestavuje stav doložených termínů.
6. `scripts/register-document.mjs` — vstupní registrace dokumentu.
7. klientské skripty `web/document-chronology.js`, `web/live-dockets.js`, `web/evidence-analyzer.js` a `web/reporter.js` — zobrazování, lokální analýza a interaktivní funkce.

## Hlavní příčina opakovaných poruch

GitHub Pages spouštěl několik samostatných mutačních kroků nad stejnými HTML soubory. Jednotlivé skripty opravovaly nebo přepisovaly výstup předchozího skriptu. Kontrola proto mohla potvrdit text vytvořený během buildu, i když zdrojové soubory v `main` nebo odkazy nebyly konzistentní.

## Nové pravidlo

Veřejný web se sestavuje pouze příkazem:

```bash
node scripts/build-site.mjs
```

Tento orchestrátor:

1. zkontroluje autoritativní registr a axiomy;
2. spustí stávající dílčí generátory v jediném pevně daném pořadí;
3. ověří výsledný web jako celek;
4. odmítne deploy při mrtvém lokálním odkazu, chybějícím PDF, duplicitním ID, chybném názvu, nedostatečné chronologii nebo porušení axiomů;
5. vytvoří veřejný manifest buildu.

Dílčí generátory zůstávají dočasně jako interní moduly kvůli bezpečnému přechodu, ale workflow je již nesmí spouštět jednotlivě. Následná refaktorizace je má převést na čisté funkce bez vzájemného přepisování.

## Zachované axiomy

- Mgr. Dušan Dvořák a Cannabis is The Cure, z. s., se v jejich podáních a redakčních textech neanonymizují.
- Jiná fyzická osoba se v převodech a redakčních textech označuje iniciálami; originální státní listina zůstává ve výslovně schváleném veřejném rozsahu.
- Existence podání, postoupení, přezkumu nebo dohledu se nevydává za potvrzení protiprávnosti či viny.
- Relevance je pracovní vazba k případu, nikoli právní závěr.
- Lhůta se zveřejní jen s konkrétním zdrojem a rozlišením, zda jde o zákonnou lhůtu, lhůtu uvedenou institucí, nebo redakční kontrolní datum.
- Neznámý či změněný dokument nepřebírá právní závěry jiného dokumentu.
- Publikace vyžaduje dohledatelný původ, kontrolu citací, oprávnění ke zveřejnění a lidskou revizi.

## Plánované funkce, které se nesmějí ztratit

- bezpečný vstup místního i externího PDF;
- kontrola URL, velikosti a skutečného PDF podpisu;
- lokální vytěžení textu, s jasným označením omezení OCR a CORS;
- relevance vůči dokumentům, řízením, institucím, judikatuře a předpisům;
- doložené lhůty a upozornění na nutnost nové kontroly;
- interaktivní paměť případu;
- znalostní registry právních předpisů a judikatury;
- citace každého faktického výstupu ke konkrétní listině;
- řízený proces Issue → draft PR → testy → veřejná publikace.

Draft PR #7 obsahuje významnou část externího PDF workflow. Nesmí být ztracen ani slepě sloučen; musí být přenesen do nové architektury po porovnání s aktuálním `main`.
