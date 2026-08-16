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

### Anglická verze označená za synchronizovanou po opravě pouhých lišt

- Projev: anglická stránka měla nové tři lišty, ale chyběl jí blok dalších aktuálních zpráv, důkazní přepážka zůstala jen ve dvou třetinách stránky a obsahovala zrušený vedlejší blok Case memory.
- Příčina: kontrola porovnávala jen počet a barvy lišt, nikoli úplné pořadí hlavních redakčních bloků.
- Pojistka: build nyní vynucuje anglické pořadí článek → vyhledávač → další zprávy → termíny → důkazní přepážka, odstraňuje Case memory a kontroluje plnou šířku přepážky.

### Anglické titulky odkazovaly na nepřeložené české články

- Projev: z devíti zpráv měla vlastní anglickou stránku pouze jedna; osm anglických titulků vedlo na český report.
- Příčina: datový zdroj dovoloval chybějící `hrefEn` nahradit českým `href` a označit odkaz pouze jako Czech report.
- Pojistka: všech devět zpráv musí mít vlastní `news/<report-id>.html`; chybějící `hrefEn` zastaví validační workflow.

### Mezipaměť anglické stránky držela staré skripty

- Projev: nasazené anglické HTML již obsahovalo správnou skladbu, ale prohlížeč vykresloval staré české odkazy a úzkou přepážku.
- Příčina: publikační workflow přidávalo verzi pouze ke skriptu českého `index.html`; anglický `en.html` načítal nezměněné URL `live-dockets.js` a `news-feed.js`.
- Pojistka: workflow verzováním podle commitu přepisuje oba skripty ve všech publikovaných HTML souborech a výslovně kontroluje anglickou titulní stránku.

### Riziko přepsání rozpracovaných souborů

- Projev: hlavní pracovní strom obsahoval mnoho nesouvisejících změn.
- Příčina: souběžná práce nad stejným repozitářem.
- Pojistka: opravy se provádějí v čistém dočasném worktree z aktuálního `origin/main`; cizí změny se neobnovují ani nemažou.

### Pracovní návod zveřejněný uvnitř procesních časovačů

- Projev: po rozbalení se návštěvníkovi zobrazil interní text „Povinný formát / Počítání / Úplnost“.
- Příčina: kontrolní pravidla buildu byla omylem vložena také do veřejného HTML.
- Pojistka: kontrolní pravidla zůstávají pouze ve validačním skriptu; ten zakazuje jejich návrat do generátoru a současně vynucuje veřejné pořadí `Kdy → Komu → Č. j. / sp. zn. → Kdo → Co se stalo`.

### Záměna adresáta a podatele v automatickém časovači

- Projev: u odvozené stížnosti se v polích „Komu“ a „Kdo“ objevila stejná osoba.
- Příčina: název instituce u našeho dokumentu byl použit současně jako adresát i autor.
- Pojistka: automatický časovač odvozuje adresáta z instituce napadené listiny ve vazbě `reakce_na`, zatímco podatele ukládá samostatně; veřejná karta tyto dvě hodnoty už pouze vykresluje.

### Smíšení doručovacího a rozhodujícího orgánu

- Projev: jediná položka „Komu“ nerozlišila orgán, přes který se opravný prostředek podává, a orgán, který o něm rozhoduje.
- Pojistka: karty používají samostatné `Komu` a podmíněné `Pro`; pole `Pro` se zobrazí pouze při doloženém cílovém orgánu. Kontrola pořadí vynucuje `Kdy → Komu → Pro → Č. j. / sp. zn. → Kdo → Co se stalo`.

### Pracovní text na jiné veřejné stránce

- Projev: odstranění jedné věty z titulní stránky nezaručovalo, že stejný nebo jiný technický návod nezůstal v článku či jazykové variantě.
- Pojistka: validační skript prochází všechny publikované HTML soubory pod `web/` a při výskytu známých pracovních formulací zastaví sestavení.

### Anglický Godot označený za úplný, přestože obsahoval jen redakční výběr

- Projev: anglická stránka působila jako překlad české chronologie, ale nezahrnovala všechny evidované listiny a navazující podání.
- Příčina: anglický článek byl udržován ručně a build nekontroloval úplnost proti kanonickým registrům dokumentů.
- Pojistka: jediný generátor nyní vyžaduje přesně 67 státních či veřejných záznamů a 10 našich navazujících podání, odmítne chybějící překlad a validační skript kontroluje veřejný výstup `67/67 + 10/10`. Podání bez doložené vazby zůstávají samostatně a nejsou uměle přiřazována.

### Navigace „Právě teď“ vedla jen na neúčinnou kotvu titulní stránky

- Projev: kliknutí změnilo URL na `#prave-ted`, ale návštěvníka nepřivedlo k poslednímu rozhodnutí státu.
- Příčina: navigace byla navázána na starý pomocný blok titulní stránky místo kanonické chronologie.
- Pojistka: synchronizační generátor odvozuje poslední státní záznam podle data a ID a odkazuje přímo na jeho kotvu ve „Státu lásky čas“; validační skript ověřuje odkaz i existenci cílové kotvy.

### Anglický archiv zobrazoval anglické titulky, ale otevíral české články

- Projev: návštěvník v anglickém archivu klikl na anglický titulek a byl přesměrován na českou verzi zprávy; sloučený report 23072026-003 neměl anglické přesměrování.
- Příčina: archivní odkazy nebyly součástí generátoru anglických zpráv a zůstaly na cestě `zpravy/`.
- Pojistka: generátor přepisuje každý archivní odkaz na odpovídající cestu `news/`, vytváří anglické přesměrování sloučeného reportu a validační skript zakazuje návrat českých cest u všech anglických archivních položek.

### Jazyková nabídka slibovala další jazyky, ale neumožňovala překlad

- Projev: portugalský ani jiný návštěvník bez znalosti angličtiny neměl na co kliknout.
- Příčina: text o budoucích jazycích byl pouze informativní a neobsahoval funkci.
- Pojistka: hlavní veřejné plochy načítají společnou nabídku automatického překladu s přímou portugalštinou, dalšími hlavními jazyky a vstupem do nabídky více než 100 jazyků; strojový překlad je vždy oddělen od rozhodujících českých listin.

## Povinný postup před publikací

1. Pracovat z aktuálního čistého `origin/main`.
2. Spustit celý kanonický build.
3. Spustit `node scripts/validate-live-dockets-contract.mjs`.
4. Ověřit, že diff neobsahuje nesouvisející generované změny.
5. Publikovat až po úspěchu workflow a zkontrolovat živou stránku s verzovanými aktivy.
