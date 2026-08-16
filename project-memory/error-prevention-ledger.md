# Registr chyb a pojistek

Tento soubor je trvalá pracovní paměť projektu. Před každou změnou titulní strany a publikačního workflow se musí projít příslušné pojistky níže. Nová chyba se zapíše spolu s příčinou, opravou a regresním testem.

## Závazná pravidla titulní strany

- Před hlavním článkem jsou právě tři lišty: Godot online, Aktivní soudní řízení a Živé procesní časovače.
- Všechny tři lišty mají trvale pozadí `#285b6f` a bílé písmo.
- Rozbalené procesní časovače mají bílé písmo i ve vnořených prvcích a odkazech.
- Aktivní soudní řízení jsou řazena vzestupně podle doloženého data začátku.
- Za třemi lištami následuje článek s obrázkem, vyhledávač, Další aktuální zprávy a ostatní stávající rámečky.
- Místní důkazní přepážka je široká jako ostatní hlavní rámečky.
- Mobilní soudní karty se na telefonu skládají do jednoho sloupce.
- Produkční CSS a JavaScript mají verzi v URL podle commitu, aby různé prohlížeče nedržely starou podobu.

## Zaznamenané chyby

### Duplicitní Godotova lišta

- Projev: nad požadovanou lištou zůstal starý text „Každá zpráva má dohledatelný zdroj / Godot online“.
- Příčina: starý statický blok a nový JavaScriptový blok existovaly současně.
- Pojistka: validační skript odmítá zrušené lišty a vyžaduje přesně tři hlavní vstupy.

### Třetí lišta nebo její obsah nebyly čitelné

- Projev: v některém prohlížeči nebyla třetí lišta modrá; rozbalené časovače měly černé písmo na tmavém pozadí.
- Příčina: konflikt starších CSS pravidel a mezipaměť prohlížeče.
- Pojistka: přesnější CSS selektory, bílé písmo s nutnou prioritou, verzované URL CSS/JS a kontrola barevné smlouvy ve workflow.

### Soudní řízení nebyla chronologická

- Projev: červencové řízení se zobrazilo před květnovými a červnovými.
- Příčina: pořadí bylo ručně zapsané bez strojově kontrolovaného data.
- Pojistka: každá karta má `data-start-date`, pole se řadí podle data a workflow kontroluje všech devět položek.

### Návrat šesti lišt místo tří

- Projev: tři pozdější commity změnily závaznou třílišťovou skladbu na šest lišt.
- Příčina: nová implementace vycházela z neplatné představy o titulní straně a přepsala existující smlouvu.
- Náprava: tyto tři commity byly vráceny; zdrojem pravdy je třílišťová smlouva.
- Pojistka: `scripts/validate-live-dockets-contract.mjs` musí vyžadovat přesně tři lišty a workflow jej spouští před publikací.

### Bílé historické karty s bílým písmem

- Projev: dvě bílé karty pod nadpisem „Historický společný referenční bod vědomosti státu“ nebyly v rozbalených časovačích čitelné.
- Příčina: obecné pravidlo pro bílé písmo v tmavě modrém bloku přebarvilo také potomky bílých karet.
- Pojistka: `.historical-notice` a všechny její vnořené prvky mají výslovně černé písmo; validační skript tuto výjimku vyžaduje.

### Riziko přepsání rozpracovaných souborů

- Projev: hlavní pracovní strom obsahoval mnoho nesouvisejících změn.
- Příčina: souběžná práce nad stejným repozitářem.
- Pojistka: opravy se provádějí v čistém dočasném worktree z aktuálního `origin/main`; cizí změny se neobnovují ani nemažou.

## Povinný postup před publikací

1. Pracovat z aktuálního čistého `origin/main`.
2. Spustit celý kanonický build.
3. Spustit `node scripts/validate-live-dockets-contract.mjs`.
4. Ověřit, že diff neobsahuje nesouvisející generované změny.
5. Publikovat až po úspěchu workflow a zkontrolovat živou stránku s verzovanými aktivy.
