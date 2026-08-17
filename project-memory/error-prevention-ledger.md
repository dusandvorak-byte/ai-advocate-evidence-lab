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

### Jazyková nabídka byla jen na titulních stránkách

- Projev: po otevření konkrétní zprávy nebo evidenční stránky návštěvník o přístup k automatickému překladu přišel.
- Příčina: překladač vkládal pouze synchronizátor čtyř hlavních veřejných ploch.
- Pojistka: poslední krok jediného veřejného buildu prochází všechny HTML stránky se záhlavím a připojuje společný překladový skript i styl; validační kontrola odmítne každou stránku se záhlavím, která je nemá.

### Evidenční listiny neměly záhlaví pro vložení jazykové nabídky

- Projev: překladač fungoval v článcích, ale při přímém otevření evidenční listiny zmizel.
- Příčina: první plošná kontrola vybírala jen HTML s prvkem `.topline` nebo jazykovým menu.
- Pojistka: build nyní pokrývá každou úplnou veřejnou HTML stránku; tam, kde není záhlaví, skript zobrazí plovoucí jazykové tlačítko. Originální PDF zůstávají nedotčenými českými zdroji.

### Aktivní soudní řízení používala zkratky názvů soudů

- Projev: karty uváděly například „MS v Praze“, „OS Prostějov“ nebo nesprávně zkrácené „OS Praha 4“.
- Pojistka: kanonický generátor používá celé úřední názvy Městského soudu v Praze, Obvodního soudu pro Prahu 4, okresních soudů i Vrchního soudu v Praze; validační skript návrat soudních zkratek zakazuje.

### Anglická titulní stránka měla anglické nadpisy, ale české karty a cíle

- Projev: rozbalená soudní řízení, nejnovější listina a odkazy hlavního článku či termínů vracely návštěvníka k českému obsahu.
- Příčina: sdílený klientský generátor lokalizoval pouze názvy tří lišt a synchronizátor překládal jen část textů.
- Pojistka: anglická varianta má devět plně anglických soudních názvů a odpovídající kotvy v anglickém Godotovi; nejnovější listiny i redakční odkazy vedou na anglické stránky. Kontrola zakazuje číselné cesty `zpravy/` na anglické titulní stránce.

### Anglické živé časovače byly jen odkazem na český seznam

- Projev: třetí anglická lišta neobsahovala stejné procesní karty jako česká verze.
- Příčina: generátor zapisoval 36 časovačů pouze do české titulní stránky a anglický klient vytvářel náhradní odkaz.
- Pojistka: stejný kanonický generátor nyní zapisuje 36 samostatně přeložených anglických karet s poli `When → To → For → Reference → From → What happened` a anglickým procesním režimem. Chybějící překlad nebo jiný počet zastaví build.

### Anglické odkazy vypadaly správně, ale jejich kotvy neexistovaly

- Projev: devět časovačů odkazovalo na anglická navazující podání a devět karet řízení na český kontext, ale po kliknutí se stránka neposunula na cílový záznam.
- Příčina: generátor zapsal identifikátor podání pouze do atributu `data-outgoing-id` a karty řízení skládaly české kotvy, které česká stránka nevytváří.
- Pojistka: každé anglické navazující podání dostává skutečné `id="en-…"`, karty řízení odkazují na existující kanonickou českou chronologii a validační skript kontroluje existenci každé takové cílové kotvy.

### Překladová nabídka se spouštěla znovu uvnitř přeložené stránky

- Projev: po volbě dalšího jazyka se mohl překlad řetězit přes již přeloženou adresu, otevírat další karty a rozbít navigaci.
- Příčina: společný skript nerozlišoval původní web od kopie na doméně překladače a používal automatickou detekci zdrojového jazyka.
- Pojistka: na doméně `.translate.goog` se vlastní nabídka znovu nevkládá, zdrojový jazyk se určuje z `lang` původní stránky a překlad pokračuje ve stejné kartě. Překladový skript má povinnou verzi v URL, aby prohlížeče nepoužívaly starou kopii; další změnu těchto pravidel hlídá validační skript.

### Církevní weby zobrazovaly v Praze včerejší datum

- Projev: česká i anglická stránka Konopné církve zůstala po půlnoci na 16. srpnu, přestože v Česku už bylo 17. srpna.
- Příčina: synchronizátor odvozoval veřejné datum z UTC a navíc měl název měsíce pevně nastavený na srpen.
- Pojistka: všechny čtyři hlavní veřejné plochy používají kalendářní datum v časovém pásmu `Europe/Prague`, měsíc se formátuje automaticky a build samostatně kontroluje české i anglické záhlaví Konopné církve.

### Přeložený církevní web zachoval jazyk, ale článek skončil chybou 404

- Projev: návštěvník zůstal v portugalštině, avšak odkaz `listiny/...` se z adresáře `/kc/` přeložil na neexistující `/kc/listiny/...`.
- Příčina: česká ani anglická církevní stránka neměla deklarovaný společný kořen relativních cest.
- První nedostatečná oprava: samotné `<base href="../">` fungovalo v původním webu, ale překladová proxy je při přepisu odkazů nerespektovala; německý test stále skončil na `/kc/listiny/...` a chybě 404.
- Pojistka: synchronizátor ponechává základní cestu a současně převádí všechny místní odkazy, obrázky a skripty církevních webů na jednoznačné absolutní cesty `/ai-advocate-evidence-lab/...`. Build odmítne návrat relativní cesty k listinám, článkům, PDF, aktivům nebo církevním stránkám.

### Navazující podání byla evidována, ale mohla se odpojit od původní listiny

- Projev: reakce uživatele byly vedeny samostatně nebo se při dalším buildu nezobrazily přímo pod konkrétním úkonem orgánu veřejné moci.
- Příčina: chyběla kanonická vazba `reakce_na` a přesná kontrola cílové položky i veřejné PDF cesty.
- Pojistka: každá reakce má stabilní ID, vazbu `reakce_na`, hashově ověřené PDF a anglický popis. Build vyžaduje jednu reakci pod položkou 47 a všech sedm reakcí pod položkou 67, včetně přesných aktivních PDF odkazů; chronologie vždy začíná polem `Datum`.

### Předchozí podání bylo chybně zaměnitelné za odpověď orgánu

- Projev: PDF formální výzvy mohlo být označeno jako odpověď EUDA, přestože jde o podání, na které EUDA teprve reagovala.
- Příčina: chronologie uměla vykreslit pouze následnou vazbu `reakce_na`, nikoli opačný směr.
- Pojistka: kanonická vazba `podani_na_ktere_organ_reaguje` se vykresluje samostatným popiskem „Podání, na které orgán veřejné moci reaguje“; validační skript u položky 59 vyžaduje anglickou i českou výzvu a oddělenou následnou reakci s přesnými PDF odkazy.

### Originál úkonu a následná stížnost nesmějí zůstat oddělené

- Projev: položka České televize obsahovala pouze evidenční popis bez originálního PDF a pozdější stížnost nebyla připojena k odmítnutí smíru.
- Pojistka: položka 13 musí po každém buildu obsahovat hashově ověřené PDF odpovědi ČT ze dne 1. června 2026 a právě jednu následnou reakci ze dne 15. srpna 2026 s vlastním aktivním PDF; stejná vazba se překládá do anglické chronologie.

## Povinný postup před publikací

1. Pracovat z aktuálního čistého `origin/main`.
2. Spustit celý kanonický build.
3. Spustit `node scripts/validate-live-dockets-contract.mjs`.
4. Ověřit, že diff neobsahuje nesouvisející generované změny.
5. Publikovat až po úspěchu workflow a zkontrolovat živou stránku s verzovanými aktivy.
