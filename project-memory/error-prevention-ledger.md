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

### Mobilní test musí akceptovat kanonickou absolutní cestu sdíleného stylesheetu

- Projev: nově zapojený mobile-readability test odmítl `web/kc/en.html`, přestože stránka správně načítala `/ai-advocate-evidence-lab/brand.css`.
- Příčina: starý test připouštěl pouze doslovné `href="brand.css"` a nepočítal s legitimní projektovou absolutní cestou používanou sesterskými plochami.
- Náprava: test akceptuje relativní, nadřazenou i projektovou absolutní cestu k témuž `brand.css`, včetně cache-busting query.
- Pojistka: mobilní kontrakt ověřuje skutečné použití sdíleného stylesheetu, nikoli jedinou syntaktickou podobu URL.

### Pozdější desktopové CSS nesmí znovu rozdělit mobilní hlavní článek na dva sloupce

- Projev: na telefonu byl začátek titulní stránky čitelný, ale hlavní naposledy zveřejněný článek se níže na stránce smrskl do úzkého pravého proužku; text se lámal téměř po písmenech a většina šířky zůstávala nevyužitá.
- Příčina: starší `@media (max-width: 980px)` správně nastavilo `.lead-card` na jeden sloupec, ale později v témže `brand.css` následovala desktopová vrstva Newsroom v3 s `grid-template-columns: minmax(300px, 1.08fr) minmax(0, 1fr)`. Kvůli pořadí v kaskádě tato pozdější deklarace na telefonu znovu vytvořila dva sloupce; první měl minimálně 300 px a textovému druhému sloupci zbyl jen úzký pravý pruh.
- Náprava: na úplný konec `brand.css` je přidána finální mobilní pojistka do 980 px, která vynutí `.news-lead` i jeho jediný `.lead-card` na jednu plnou šířku a nastaví obrazovou i textovou část na `width:100%; min-width:0`.
- Pojistka: `test/mobile-readability-v5.test.mjs` kontroluje nejen existenci pravidla, ale i to, že se nachází až za posledním desktopovým dvousloupcovým pravidlem. PR i produkční build test spouštějí a live gate navíc ověřuje nasazený `brand.css`.

### Produkční gate nesmí hlídat layout, který byl záměrně nahrazen novým kanonickým komponentem

- Projev: nový soudní registr, tabulka i křížová validace prošly, ale produkční workflow se zastavilo před publikací, protože souhrnný shell stále vyžadoval staré CSS `grid-template-columns:260px minmax(0,1fr)` a historické selektory `.nav-courts`.
- Příčina: při přechodu z původních soudních karet na sticky třílišťový blok nebyly odstraněny všechny redundantní produkční grepy, přestože specializované validátory už kontrolovaly nový kontrakt.
- Náprava: pre-publish i live gate nyní kontrolují `position:sticky`, tabulkové šířky 42/18/18/12/10, mobilní breakpoint a nový `.docket-control`; historické `.nav-courts` podmínky byly odstraněny.
- Pojistka: při změně kanonického layoutu se ve stejném release musí vyhledat a nahradit všechny duplicity jeho starého kontraktu v PR i produkčních workflovech.

### Aktivní soudní řízení nesmějí být ručně oddělená od Godota a Justičního slalomu

- Projev: titulní lišta soudních řízení byla statické pole v `live-dockets.js`; mohla proto dál uvádět starý procesní stav i poté, co do Godota přišlo nové soudní rozhodnutí nebo do Justičního slalomu nový opravný prostředek. Odkazy navíc vedly na obecnou homepage Konopí je lék.cz.
- Příčina: soudní přehled neměl vlastní kanonický registr ani křížovou validační vazbu na dokumenty státu, vlastní obranu a `cases.json`.
- Náprava: zaveden `project-memory/active-court-dockets.json`, generovaný veřejný `web/data/active-court-dockets.json` a validační kontrakt Godot ↔ Slalom ↔ cases ↔ soudní přehled. Poslední sloupec vyžaduje konkrétní deep-link; obecný homepage odkaz je zakázán.
- Pojistka: změna rozhodnutí nebo obrany, která není propsána do příslušné soudní větve, musí zastavit build. Tři hlavní lišty jsou samostatný sticky ovládací blok, aby všechny zůstaly viditelné i při rozbalení dlouhé tabulky.

### Datumová validační brána nesmí předpokládat, že historický den zůstane nahoře navždy

- Projev: po přidání správně novějších podání z 6. a 8. 10. 2026 selhala produkce na validatoru podání z 4. 10., protože vyžadoval jejich přítomnost mezi prvními 11 řádky celé chronologie.
- Příčina: historická dávka měla validační podmínku založenou na tehdejší absolutní pozici místo na vlastním datovém bloku; přidání novějších podání proto vytvořilo falešnou chybu.
- Náprava: validator 4. 10. kontroluje přítomnost tří dokumentů uvnitř bloku data 4. 10. 2026. Celkové sestupné řazení a číslování nadále kontroluje obecný `validate-justice-slalom.mjs`.
- Pojistka: dávkové validátory nesmějí fixovat absolutní top-N pozici, pokud veřejný registr dovoluje legitimní přidávání novějších položek.

### Vlastní podání a reakce orgánů nesmějí být zaměněny mezi Godotem a Justičním slalomem

- Projev: podání autora z 6. a 8. 10. 2026 byla po předchozím pokynu publikována pouze vztahově v Godotu a bez položek Justičního slalomu.
- Aktuální závazné rozdělení: hlavní řádky Godota / Státu lásky čas tvoří příchozí listiny státních, veřejných a mezinárodních institucí; vlastní podání autora a aliance tvoří Justiční slalom. V Godotu se vlastní podání smějí současně zobrazit pouze vztahově u reakce orgánu.
- Náprava: podání 6. a 8. 10. dostávají metadata Justičního slalomu a byte-identické originální PDF; potvrzení Evropského ombudsmana 202602199 a listiny MS Praha 15 Ad 14/2026-13 a -17 se přidávají jako tři nové příchozí řádky Godota.
- Pojistka: validační gate výslovně vyžaduje, aby oba vlastní dokumenty byly v `web/data/justice-slalom.json` a nebyly hlavními řádky State Love, zatímco všechny tři příchozí dokumenty musí být hlavními řádky State Love a nesmějí být položkami Justičního slalomu.

### Produkční kontrola Justičního slalomu nesmí prohledávat celý Godot/Index

- Projev: produkční workflow #613 označilo živý Justiční slalom za nesynchronizovaný, protože hledalo dokument výslovně vyloučený ze Slalomu v celém `index.html`; tentýž dokument byl přitom legitimně přítomen v Godotu jako vztahová listina.
- Příčina: live gate nekontroloval hranici komponentu a zaměnil obsah Godota s obsahem Justičního slalomu.
- Náprava: produkční gate nejprve vyřízne pouze blok mezi `JUSTICE-SLALOM:BEGIN/END` a všechny pozitivní i negativní slalomové invarianty ověřuje jen v něm.
- Pojistka: dokument smí být současně viditelný v Godotu a vyloučený ze Slalomu; negativní testy komponent se nikdy nesmějí aplikovat na celý sdílený HTML dokument.

### Klonovaný veřejný komponent musí normalizovat odkazy pro cílový URL kontext

- Projev: po vložení State Love panelu na Konopnou církev obsahoval klon odkazy `href="listiny/..."`, které jsou kvůli odlišnému `<base>` a automatickému překladu na církevní ploše nepřípustné.
- Příčina: HTML komponenta byla přenesena z Godota na jiné veřejné plochy byteově, bez normalizace relativních URL.
- Náprava: terminální renderer při klonování State Love panelu převádí všechny interní relativní `href` a `src` na absolutní kořen `/ai-advocate-evidence-lab/`; externí, kořenové, fragmentové a mailto odkazy ponechává nedotčené.
- Pojistka: sdílený komponent určený pro stránky s různým `<base>` nesmí přenášet stránkově relativní URL; stávající čtyřplošný validator dál zakazuje relativní `listiny/`, `news/`, `documents/`, `assets/` a `kc/` na církevních plochách.

### Validátor sdílené stránky musí kontrolovat správný komponent, ne celý dokument

- Projev: kontrola záhlaví State Love odmítla stránku kvůli výskytu „Datum“, přestože State Love správně používal „Dne“; slovo „Datum“ patřilo do samostatné tabulky Justičního slalomu na téže stránce.
- Příčina: validator hledal záhlaví globálně v celém HTML místo uvnitř tabulky `#chronologie-seznam`.
- Náprava: CZ i EN kontrola nejprve vyřízne konkrétní State Love tabulku podle stabilního ID a teprve v ní ověřuje její záhlaví.
- Pojistka: komponentové invarianty na sdílených stránkách se validují uvnitř hranice konkrétního komponentu; text legitimně použitý v sousedním komponentu nesmí způsobit falešný pád.

### Hromadná změna textu nesmí rozbít syntaxi JavaScriptových literálů

- Projev: anglický titul Godota obsahující apostrof ve slově `State's` byl hromadnou náhradou vložen do dvou validátorů jako řetězec uzavřený jednoduchými apostrofy; validační skript proto skončil syntaktickou chybou až po dokončení téměř celého buildu.
- Příčina: textová náhrada zachovala obsah, ale neověřila syntaktický kontext cílového JavaScriptového literálu.
- Náprava: anglický titul je v obou kritických validátorech uzavřen dvojitými uvozovkami a všechny související výskyty byly společně zkontrolovány.
- Pojistka: PR i produkční workflow spouštějí před dražšími materializačními kroky `node --check` nad `validate-live-dockets-contract.mjs` a `validate-process-chain-contract.mjs`; změny uživatelských textů s apostrofy musí projít touto časnou syntaktickou bránou.

### Mezivalidátor nesmí vyžadovat artefakt terminálního publikačního kroku

- Projev: `validate-publication-surfaces.mjs` požadoval State Love panel na titulních a církevních plochách už uvnitř `build-site.mjs`, ačkoli tyto klony vznikají až v následném terminálním kroku `build-justice-slalom.mjs`.
- Příčina: validační povinnost byla přiřazena nesprávné fázi pipeline.
- Náprava: mezivalidátor kontroluje pouze kanonickou tabulku, CSS, data a průběžné synchronizační invarianty; přítomnost finálního Godot panelu na čtyřech hlavních plochách kontroluje až `validate-live-dockets-contract.mjs` po `build-justice-slalom.mjs`.
- Pojistka: nový validator smí požadovat jen artefakty, které již v daném kroku pipeline existují; terminální artefakty se ověřují až po jejich generátoru.

### Generátor nesmí předpokládat pořadí HTML atributů

- Projev: po přesunu kotvy `id="chronologie"` přímo na State Love panel selhal build-process-timers, protože hledal pouze doslovný začátek `<section class="justice-slalom-shell state-love-shell"`.
- Příčina: selektor byl založen na pořadí atributů místo na stabilní třídě a hranici elementu.
- Náprava: generátor nyní nejprve vyhledá stabilní class marker a následně nejbližší předchozí `<section`; pořadí atributů `id`/ `class` je irelevantní.
- Pojistka: nové veřejné panely smějí měnit nebo doplňovat atributy bez nutnosti přepisovat interní generátory; build selže pouze tehdy, když skutečně chybí třída nebo počáteční element.

### State Love nesmí přetékat mimo page shell a Godot nesmí být jen odkaz

- Projev: sedmisloupcová tabulka Státu lásky čas měla pevné minimum 1280 px, takže na části desktopových šířek vybočovala z 1240px page shellu; první pořadové číslo se mohlo zalomit. Godot online byl na titulní stránce pouze odkaz, zatímco Justiční slalom byl skutečný rozbalovací panel.
- Příčina: State Love sdílel barvy a základní tabulkovou masku se Slalomem, ale měl vlastní příliš široký `min-width` a nebyl vložen do stejného rozbalovacího lifecycle na hlavních plochách.
- Náprava: desktopová State Love tabulka je 100% široká v rámci shellu, první sloupec má 5 % a zákaz zalomení čísla, sloupce 4–5 jsou zúženy na 8 % a 21 %, vztahové sloupce mají po 25 %. Pod 1100 px přechází přebytečná šířka pouze do vnitřního horizontálního scrollu. Godot panel se buildem klonuje na hlavní CZ/EN a církevní plochy a runtime jej přesouvá do stejného stacku jako Justiční slalom.
- Pojistka: validační brány kontrolují přesné šířky 5/6/10/8/21/25/25, záhlaví „Dne“, nowrap prvního sloupce, zákaz `min-width:1280px`, tablet/mobile scroll uvnitř panelu, přítomnost sbaleného State Love panelu na čtyřech hlavních plochách a dynamický počet reakcí bez ručně psané hodnoty.

### Dostupný binární originál se po ověření musí publikovat jako originál

- Projev: rozhodnutí ministra vnitra MV-134798-4/SO-2026 bylo nejprve zveřejněno jen jako deterministická textová kopie, přestože uživatel dodal kompletní binární PDF.
- Příčina: omezení přímého binárního zápisu přes konektor bylo chybně považováno za konec publikační cesty.
- Náprava: originál se přenáší přes již používaný kontrolovaný XZ+Base64 binary-transport, při buildu se rekonstruuje a ověřuje přes velikost, PDF hlavičku/EOF a SHA-256.
- Pojistka: je-li úplný binární originál dostupný, musí se před textovým fallbackem prověřit schválená cesta binary-transport; veřejný soubor musí mít SHA-256 shodné se zdrojem.

### Live cache-busting musí být unikátní pro každý opakovaný pokus

- Projev: produkční workflow po úspěšném pushi do `gh-pages` opakovaně hlásilo starý `index.html`, přestože samotná větev `gh-pages` už obsahovala nový dokument a správný `.source-commit`.
- Příčina: všech 12 live pokusů používalo stejný query parametr odvozený jen z SHA/run ID/run attempt. První stará odpověď CDN se proto mohla uložit pod tímto klíčem a všechny další pokusy četly tutéž cache.
- Náprava: každý opakovaný požadavek v hlavní šestiplošné live kontrole přidává vlastní `live_try=$attempt`, takže opakování skutečně znovu ověřuje aktuální publikaci.
- Pojistka: při každé opakované live kontrole musí být cache-busting klíč proměnný i uvnitř smyčky; samotné číslo workflow attempt nestačí.


### Vyřízený opravný prostředek se nesmí znovu odvodit jako aktivní timer

- Projev: po zveřejnění rozhodnutí o rozkladu by obecný generátor mohl z původního odchozího rozkladu znovu vytvořit aktivní interní časovač, i když příchozí rozhodnutí už opravný prostředek vyřídilo.
- Příčina: odvození opravných prostředků dosud zohledňovalo typ a datum odchozího podání, ale nikoli kanonickou relaci `resolves` z pozdější příchozí státní listiny.
- Náprava: generátor vytváří množinu `resolvedRemedyDocumentIds` z příchozích listin a vyřízené opravné prostředky před odvozením časovače vyloučí; současně se odstraní jejich staré ruční povinné časovače.
- Pojistka: validator odmítne build, pokud se vyřízený rozklad znovu objeví v konečném procesním registru nebo veřejném HTML.


### Živá validační brána nesmí kontrolovat zastaralou cestu po změně PDF provenance

- Projev: produkční build, kanonické validátory i publikace do gh-pages uspěly, ale závěrečný live gate skončil 404, protože dál stahoval staré cesty `092-...-verejna-textova-kopie.pdf` a `093-...-verejna-textova-kopie.pdf` po jejich nahrazení byte-identickými originály.
- Příčina: změna kanonické PDF cesty nebyla atomicky propsána do produkčního live smoke testu.
- Náprava: live gate používá nové originální cesty 092/093 a samostatnou originální cestu ÚOOÚ 089-original. Stav živého Slalomu i SHA-256 těchto originálů se kontrolují opakovaně až po skutečné propagaci GitHub Pages; zároveň se ověřuje, že EKK 2. 10. není v Justičním slalomu, zatímco dopis Unii obhájců a originály ÚOOÚ, FTV Prima a NCOZ/MS Praha jsou v živém HTML přítomny.
- Pojistka: při každé změně `public.pdf` nebo typu provenance musí stejný release packet aktualizovat také všechny live `curl`/hash kontroly daného artefaktu; stará veřejná cesta se nesmí ponechat jako povinný live test, pokud nemá být záměrně kompatibilní.


- Doplňující pravidlo: HTML i PDF mohou být po pushi do gh-pages krátce na rozdílné verzi. Live gate proto nesmí po prvním úspěšném HTTP 200 ihned prohlásit shodu; musí čekat na obsahový marker HTML a u binárních originálů na přesnou SHA-256 shodu.

### Dostupný binární originál nesmí být nahrazen nově vysázenou „veřejnou kopií“

- Projev: u podání ÚOOÚ z 2. 10. 2026, doplnění žaloby FTV Prima z 2. 10. 2026 a reakce NCOZ/MS Praha z 4. 10. 2026 byly v Justičním slalomu zveřejněny nově vysázené textové kopie, přestože autor dodal původní binární PDF.
- Příčina: materializační fallback z extrahovaného textu byl použit jako výchozí cesta místo až jako nouzová cesta při skutečné nedostupnosti binárního originálu.
- Náprava: veřejný web nyní materializuje byte-identické binární originály a kontroluje jejich původní SHA-256; FTV Prima a reakce 4. 10. mají neutrální originální PDF cesty, ÚOOÚ zachovává stabilní cestu 089 s nahrazením obsahu přesným originálem.
- Pojistka: zdrojový stav original_pdf_uploaded_by_user vyžaduje shodu hash(public PDF) = source_sha256, nulová metadata public_copy_manifest/public_sha256 a veřejný popisek Původní PDF / Original PDF. Textový fallback je dovolen jen při doložené nedostupnosti binárního zdroje.


### Finální normalizátor vracel nestandardní popisky veřejných PDF kopií

- Projev: kanonický generátor správně použil veřejný popisek `Dokument v PDF`, ale pozdější writer `normalize-godot-link-labels.mjs` jej u souborů `verejna-textova-kopie.pdf` znovu změnil na `ověřená veřejná textová kopie PDF`. Tím selhal starší validační gate a porušil se axiom dvoustavových veřejných popisků.
- Příčina: typ veřejné kopie byl chybně promítnut do uživatelského textu odkazu místo do provenienčních metadat.
- Náprava: všechny veřejné PDF odkazy v českém Godotovi používají pouze `Dokument v PDF`, v anglickém `PDF document`; provenience a informace o ne-byte-identické kopii zůstávají v registru, SHA a verifikačním stavu.
- Pojistka: normalizátor odmítne návrat starého popisku a procesní i EKK validační gate kontrolují kanonické dvoustavové označení.


### Při průběžné publikaci nesmí novější uploady v témže vlákně zůstat mimo release balík

- Projev: po zveřejnění dřívějšího balíku zůstaly mimo web čtyři později nahrané listiny: KS Brno 9 To 315/2026-140, doplnění žaloby EKK pro OS Praha 10, přípis MS Praha 18 A 17/2026-191 a navazující reakce žalobce datovaná 4. 10. 2026.
- Příčina: publikační průchod byl uzavřen podle dříve vymezeného balíku, aniž byl před release znovu porovnán seznam nejnovějších uploadů ve vlákně s kanonickým registrem.
- Náprava: před každým release se nyní dělá delta kontrola posledních uploadů proti `document-sources.json`; již evidovaná listina se neduplikuje a chybějící listiny se přidají do jednoho následného balíku.
- Pojistka: `validate-four-records-2026-10-03.mjs` kontroluje všechny čtyři ID, jejich PDF, CZ/EN Godot, procesní vazby a obě nové položky Justičního slalomu.


### EKK 2. 10. 2026 zůstává důkazem, ale není položkou Justičního slalomu

- Aktuální redakční pokyn autora ze dne 4. 10. 2026 výslovně vylučuje hlavní procesní a důkazní návrh EKK z 2. 10. 2026 z modulu Justiční slalom.
- Dokument a jeho 33stránková Důkazní chronologie zůstávají v kanonické důkazní paměti, procesních vazbách a CZ/EN Godotovi; odstranění z Justičního slalomu není odstraněním důkazu z projektu.
- Pojistka: scripts/validate-ekk-evidence-2026-10-02.mjs fatálně selže, pokud se document_id hlavního podání EKK znovu objeví v web/data/justice-slalom.json.


### Rozbalená Aktivní soudní řízení měla příliš malé písmo

- Projev: názvy soudních řízení v rozbalené liště měly jen 13 px a doprovodný text o dostupnosti žalob a návrhů na obnovu jen 12 px, takže byl panel při běžném zobrazení špatně čitelný.
- Příčina: původní typografie byla nastavena jako drobný navigační detail, i když se panel obsahově chová jako samostatná informační sekce přes celou šířku stránky.
- Náprava: názvy řízení používají 16 px / 1,45 a váhu 800; doprovodný text i aktivní odkaz Konopí je lék.cz používají 14 px / 1,5. Svislé rozestupy položek byly mírně zvětšeny.
- Pojistka: `validate-live-dockets-contract.mjs` a produkční live gate ověřují přesné 16/14px hodnoty a jejich zachování na finálním CSS artefaktu.


### Konopná církev zmiňovala rozklad, ale nevedla návštěvníka na jeho konkrétní důkaz

- Projev: živá církevní plocha správně uváděla usnesení MK 53547/2026 SOCNS a rozklad z 1. 9. 2026, ale odkazy mířily jen na obecnou chronologii; uzel sdílené paměti přitom stále zvýrazňoval starší MK 49467/2026 SOCNS. Rozklad navíc nebyl v kanonickém registru propojen relací `reakce_na` s usnesením o zastavení řízení.
- Příčina: procesní stav byl aktualizován v interním časovači a redakčním textu, nikoli zároveň v dokumentovém grafu a přesných veřejných odkazových cílech.
- Náprava: rozklad č. 022 z 1. 9. 2026 je veden jako `appeal`, má relaci `reakce_na` na MK 53547/2026 SOCNS, církevní CZ/EN plochy odkazují na přesný záznam rozhodnutí a přímo na PDF rozkladu a aktuální uzel již nezvýrazňuje MK 49467/2026.
- Pojistka: `validate-church-current-state.mjs` kontroluje kanonickou relaci, interní rozkladovou fázi, přímý PDF důkaz, přesné CZ/EN kotvy, sesterské odkazy, nepřítomnost zrušené kotvy časovačů a právě jeden finální `shell-axis.css`.


### Live gate zaměnil historickou listinu za trvalou součást trojice nejnovějších záznamů

- Projev: po korektním přidání nové listiny EUDA z 1. 10. 2026 produkce dvakrát spadla na `index.html`, přestože build i `gh-pages` byly správné. Pevně vyžadovaný údaj `18 A 17/2026-186` už nebyl na titulních plochách, protože legitimně vypadl z trojice nejnovějších listin.
- Příčina: live workflow měl natvrdo zapsané konkrétní státní reference a vyžadoval je na všech šesti veřejných plochách, místo aby odvozoval aktuální trojici nejnovějších listin z kanonického buildu. Test tím zaměnil proměnlivý redakční výběr za trvalý invariant.
- Náprava: live gate nyní odvozuje tři aktuální `latest-record-card` ID z finálního buildu a ověřuje tutéž dynamickou trojici na CannaInsideru CZ/EN i Konopné církvi CZ/EN a v Godotovi. Historické státní reference se kontrolují pouze v úplné chronologii Godota.
- Pojistka: pre-merge validátor porovnává tři nejnovější kanonické státní/veřejné záznamy se čtyřmi hlavními veřejnými plochami; přidání nové listiny nesmí vyžadovat ruční přepis pevného seznamu ve workflow.


### Jeden merge spouštěl produkci dvakrát a vytvářel zbytečné GitHub notifikace

- Projev: po merge se současně rozběhl produkční workflow z `push main` a druhý běh přes `dispatch-production-after-merge.yml`; concurrency pak jeden z nich rušila a vznikal další notifikační šum.
- Příčina: vedle kanonického produkčního triggeru existoval ještě redundantní workflow, který po uzavření PR volal `gh workflow run publish-gh-pages-branch.yml --ref main`.
- Náprava: redundantní dispatcher je odstraněn; produkce se automaticky spouští pouze jednou, přímo pushnutím merge commitu do `main`. PR validace má concurrency podle čísla PR a ruší pouze starší rozběhnutou validaci stejného PR.
- Pojistka: `scripts/validate-architecture.mjs` odmítne jakýkoli další workflow, který znovu volá produkční `publish-gh-pages-branch.yml`.


### Křiklavě žlutá navigace CannaInsideru zhoršila čitelnost, nejvýrazněji v archivu zpráv

- Projev: na CannaInsideru, zejména na `zpravy/index.html`, byla sytá žlutá `#ffeb3b` opticky agresivní a text navigace se četl špatně.
- Příčina: sdílený vizuální kontrakt používal velmi syté žluté pozadí bez samostatného čitelnostního gate pro archivní plochy.
- Náprava: CannaInsider CZ/EN používá tlumenou slámově-krémovou `#eee6bd`, tmavý text `#16242d`, silnější řez a tlumenější aktivní/hover stav `#dfd29a`. Konopná církev zůstává na vlastním vizuálním kontraktu.
- Pojistka: `validate-live-dockets-contract.mjs` kontroluje nový barevný kontrakt a oba archivy; produkční workflow ověřuje CSS i živé archivní stránky a zakazuje návrat `#ffeb3b`.


### Veřejná PDF kopie měnila hash mezi dvěma běhy stejného commitu

- Projev: build, Slalom i publikace prošly, ale opakovaný live-check stejného SHA porovnal čerstvě vygenerované PDF ÚOOÚ s předchozí živou kopií a hash se lišil.
- Příčina: ReportLab generoval do PDF proměnlivá metadata, takže obsahově totožná veřejná kopie nebyla byte-deterministická. Rerun navíc používal stejný cache-busting parametr bez čísla pokusu.
- Náprava: materializátor používá `invariant=1`, takže stejný text a kód dávají stejné bajty a SHA-256; live URL používají i `GITHUB_RUN_ATTEMPT`.
- Pojistka: validační Slalom gate vyžaduje deterministický režim materializátoru; generovaný důkazní artefakt musí být reprodukovatelný napříč opakovanými běhy téhož zdroje.


### Produkce odhalila chybu validátoru, kterou PR workflow nespouštělo

- Projev: PR prošel zeleně, ale produkční workflow po merge spadlo v `validate-live-dockets-contract.mjs` na nedefinovaných proměnných církevních ploch.
- Příčina: produkční workflow spouštělo kontrakt titulní navigace, zatímco PR validační workflow tentýž validátor vůbec nespouštělo; chyba validátoru proto vznikla až po merge.
- Náprava: proměnné jsou sjednoceny na `churchCzPage` / `churchEnPage` a PR workflow nyní spouští stejný `validate-live-dockets-contract.mjs` před merge.
- Pojistka: každý produkční kontrakt, který může zablokovat publikaci kvůli zdrojům webu, musí mít odpovídající pre-merge běh; produkce nesmí být prvním místem, kde se syntaxe nebo reference validátoru vykonají.


### Rozbalená Aktivní soudní řízení byla vyosená a užší než stránka

- Projev: po rozbalení panel působil jako nezarovnaná karta přes přibližně tři čtvrtiny stránky místo jako plnohodnotná sekce v ose webu.
- Příčina: absolutně pozicovaný panel se centroval vůči prostřední položce `.nav-courts`, nikoli vůči celé navigaci / hlavnímu obsahovému rámci.
- Náprava: pozičním rámcem je celá `.nav`; `.nav-courts` je na desktopu statická a panel používá `left:0; right:0; width:auto; transform:none`.
- Pojistka: `scripts/validate-live-dockets-contract.mjs` kontroluje právě tuto geometrii a nesmí připustit návrat pevné tříčtvrteční šířky centrované vůči jedné položce.


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

### Zkrácený popis úkonu vypustil rozhodující důvod a částku

- Projev: položka 4 uváděla pouze „Vyrozumění o zastavení řízení“ a nezachovala důvod zastavení ani částku.
- Pojistka: validační smlouva vyžaduje u listiny SIN 22/2025-95 úplné znění o zastavení pro nezaplacení částky 6 800 Kč za vydání informací; stejný význam musí obsahovat anglická chronologie.

### Poškozené PDF se tiše změnilo na evidenční stránku

- Projev: u předvolání Obvodního soudu pro Prahu 4 ze dne 16. 9. 2026 ve věci 10 C 69/2026 se místo přímého odkazu „Dokument v PDF“ zobrazila „Evidenční stránka“.
- Příčina: do repozitáře se dostal useknutý 7,5kB PDF fragment bez koncového markeru `%%EOF`. Reconciliation jej správně rozpoznala jako neplatný, ale chybně jej pouze odpojila a build pokračoval, takže závada se skryla jako běžný fallback na evidenční stránku.
- Náprava: poškozený binární fragment se z kanonického zdroje odstraní; z úplného čtyřstránkového extrahovaného textu zdrojového PDF se deterministicky materializuje výslovně označená ověřená veřejná kopie. Kanonický záznam nese její SHA-256 a nesmí ji vydávat za binární originál.
- Pojistka: jestliže kanonický záznam obsahuje `public.pdf` a jeho stav deklaruje `source_pdf_received`, fyzicky přítomný, ale nepoužitelný PDF soubor je fatální validační chyba. Reconciliation jej nesmí tiše převést na `null` a degradovat na „Evidenční stránku“. Generovaná veřejná kopie současně kontroluje počet stranového textu, hlavičku `%PDF-`, koncový marker `%%EOF` a očekávaný SHA-256.

### GitHub konektor usekl binární PDF před `%%EOF`

- Projev: PDF bylo vytvořeno jako Git blob a v repozitáři mělo platnou hlavičku `%PDF-`, ale konec binárního payloadu chyběl; `reconcile-public-pdfs.mjs` jej proto správně vyhodnotil jako `invalid_public_file` a veřejné CZ plochy spadly na „Evidenční stránka“.
- Příčina: přímý přenos binárního PDF přes konektor GitHubu může u některých payloadů skončit neúplným blobem. Opakované posílání stejného binárního souboru přes `create_blob` proto není bezpečná opravná cesta.
- Závazné řešení: jakmile se prokáže useknutí nebo chybějící `%%EOF`, přímý binární upload se ukončí. Zdrojový PDF soubor se ověří samostatně a jeho SHA-256 se zapíše jako `source_sha256`. Z úplného ověřeného textového zdroje se veřejná PDF kopie deterministicky materializuje přímo v GitHub Actions / kanonickém buildu stejným generátorem jako ostatní ověřené veřejné kopie. Výstup musí mít v názvu `verejna-kopie` nebo `public-copy` a nesmí být označen jako binárně totožný originál.
- Povinné kontroly generované kopie: soubor existuje až po materializačním kroku buildu, má velikost > 1 kB, začíná `%PDF-`, obsahuje `%%EOF` v posledních 2048 bajtech, reconciliation jej ponechá jako `public.pdf`, výsledný registr uvádí `verification_status: published` a veřejné CZ i EN plochy zobrazí aktivní odkaz `Dokument v PDF` / `PDF document`.
- Zakázané náhradní postupy: nevytvářet ručně odkaz v generovaném HTML; neobcházet reconciliation; neoznačovat rekonstruovanou veřejnou kopii jako originální PDF; neopakovat přímý connector blob po zjištěném useknutí.
- Referenční řešení: listina Městského soudu v Praze ze dne 22. 9. 2026, č. j. 15 Ad 14/2026-12, byla po selhání přímého binárního blobu zapojena do `scripts/materialize-verified-public-copies-2026-09-16.py`; build ji deterministicky vytvořil jako `97-ms-praha-15-ad-14-2026-12-2026-09-22-verejna-kopie.pdf` a teprve poté prošla reconciliation a publikací.

## Povinný postup před publikací

1. Pracovat z aktuálního čistého `origin/main`.
2. Spustit celý kanonický build.
3. Spustit `node scripts/validate-live-dockets-contract.mjs`.
4. Ověřit, že diff neobsahuje nesouvisející generované změny.
5. U každého nového PDF před publikací ověřit, že fyzický soubor začíná `%PDF-`, končí platným `%%EOF` a po reconciliation zůstává aktivním `public.pdf`; pokud byl binární přenos konektorem jednou useknut, přejít povinně na deterministickou materializaci v buildu.\n6. Publikovat až po úspěchu workflow a zkontrolovat živou stránku s verzovanými aktivy.

### Justiční slalom: doplnění publikační paměti 28. 9. 2026

- **Chyba registrace adresátů:** Pouhý počet PDF není počet zveřejněných podání podle adresátů. Podání KPR č. 03 výslovně oslovuje vedoucího KPR a současně kabinet manželky prezidenta. Oprava: jeden kanonický originál, dva číslované řádky a u každého vlastní odkaz na stejné PDF. Povinná brána porovnává všechny řádky na šesti plochách s `justice_slalom.recipients`.
- **Chyba data podle názvu souboru:** Č. 13 má v textu 17. 7., č. 26 bylo podáno 23. 7. (21. 7. je napadený úkon), č. 33 má v textu 25. 7.; u č. 02 KPR autor výslovně opravil 6. června na 6. července. Datum je doloženo interně; původní PDF beze změny. Na pozdější výslovný pokyn autora se vysvětlující poznámky z veřejného archivu odstranily. Brána kontroluje opravu KPR a vzestupné chronologické řazení.
- **Neúplný předbuild pro historické PDF:** Přímé spuštění `build-site.mjs` z čistého checkoutu vedlo ke 16 chybějícím povinným institucionálním PDF. Příčina: přeskočená materializace binárních balíčků; náprava: před buildem spustit celý seznam obnovovacích kroků validačního workflow. Po předkroku 77/77 povinných listin obsahovalo PDF.
- **Neúplné anglické popisy:** Výchozí překladové vrstvě chyběly čtyři již evidované státní listiny z 24.–25. 8. 2026; build se zastavil na prvním chybějícím popisu. Náprava: doplnit všechny čtyři popisy ve verzovaném supplementu spolu s červencovou dávkou a sestavit CZ/EN z téhož manifestu.
- **Staré brány odkazovaly na zrušenou třetí lištu:** Generátory a dvě validační smlouvy vyžadovaly veřejné procesní časovače. Náprava: interní procesní paměť zůstává pro návaznosti, finální publikační krok odstraní časovače z každého veřejného HTML a vydá číslovaný archiv; brány ověřují 0 veřejných karet a paritu řádků.
- **Kořenové cesty PDF v auditu:** Odkazy `/ai-advocate-evidence-lab/documents/…` existovaly, ale audit je vyhodnocoval jako neexistující lokální soubory. Náprava: normalizovat kořen projektu před kontrolou existence; nikdy audit nevypínat.
- **Přepočítání anglické chronologie:** Starý regex sčítal všechny `data-document-id` na stránce a po přidání 64 řádků mylně hlásil 182 státních listin místo 118. Náprava: počítat jen `<li>` anglické státní chronologie; další archivní tabulka má vlastní kontrolu.
- **Obsahově shodné PDF není totožný originál:** Tři odvolání/stížnosti č. 17, 18 a 36 byly dříve veřejně dostupné s identickým textem, ale jinými binárními hashi než soubory z nového ZIPu. Původní návrh přehledu je odkazoval na staré soubory. Náprava: archivní PDF zkopírovat bajtově, aktualizovat kanonické odkazy a tři PDF override, staré URL ponechat; validační brána porovnává SHA-256 s původním souborem. Pouhá shoda textu nestačí k tvrzení o identitě originálu.
- **Neidempotentní anglická kontrola:** Opakovaný build na již aktualizovaných titulních stránkách narazil na požadavek staré redakční věty o počtu státních listin, kterou nový úvodní článek již nemá. Oprava: počty ověřovat na aktuálních kanonických kartách a manifestu; nevynucovat odstraněný text.
- **Pozdní přepsání jazykové nabídky:** Po finálním přegenerování anglické zprávy chyběly na části veřejných stránek sdílené jazykové assety, přestože dřívější build je vložil. Oprava: po posledních redakčních generátorech znovu spustit generátor jazykové nabídky a až poté vygenerovat archiv a provést konečné brány.
- **Publikační brána vyžadovala zastaralé odkazy:** PR #77 prošlo celým validačním workflow, ale první produkční běh selhal až po kontrole všech PDF hashů: dodatečná smyčka v publikačním workflow vyžadovala, aby byl starý veřejný odkaz na PDF č. 28 stále v článku nebo v listinách. Po nahrazení odkazu přesným originálem ze ZIPu už tato podmínka neplatí. Náprava: zachovat kontrolu historických SHA-256, odstranit pouze zastaralou smyčku; aktuální aktivní odkazy a každý z 65 řádků dál ověřují `audit-godot-pdf-links.mjs` a `validate-justice-slalom.mjs`. Příště publikační shellovou bránu spustit lokálně také po konečném generátoru, nejen validační workflow.
- **Veřejné vysvětlivky zahltily přehled dat:** Generátor kopíroval čtyři interní vysvětlivky rozdílných dat do buněk tabulky a jednou i do anglické verze. Autor výslovně požádal o jejich odstranění. Kořenová příčina: `date_note_*` ve zdrojovém supplementu byly přímo přeneseny do `justice-slalom.json` a HTML. Náprava: odstranit tato pole, zakázat jejich výdej generátorem a v terminálním validatoru kontrolovat nepřítomnost poznámek na všech šesti plochách i vzestupné řazení podle kanonického data; doložení rozdílů ponechat pouze v interní chybové paměti. Po produkčním nasazení ověřit řádky KPR, MV, MS Praha a NSZ živě.

### Justiční slalom: dávka srpen–září a ověření poznámek 28. 9. 2026

- **Symptom hlášený autorem:** Vnímané přetrvání vysvětlivek data v rozbalovací liště. Přímá kontrola čerstvě načteného produkčního DOM všech šesti stránek ukázala 65 číslovaných řádků a nepřítomnost čtyř uvedených vět. Zdroj, terminální generátor, `gh-pages` a produkční DOM se v této otázce nerozcházejí; příčinu konkrétního staršího zobrazení nelze doložit bez jeho adresy či snímku. Oprava brány: kontrola všech šesti jazykových ploch, zakázaných výrazů, pěti buněk v každém řádku a absence polí `date_note_*` po posledním generátoru. Po vydání nové dávky znovu kontrolovat produkci.
- **Inventura 83 nových souborů:** 80 PDF v ZIPu a tři samostatné PDF. Dva ZIP soubory (EUDA 7. 8. a KPR 10. 8.) jsou bajtově totožné s již zveřejněnými originály; přidává se jim jen záznam v archivu. Soubory ZIP č. 034 a 067 mají doslova totožný extrahovaný text, liší se PDF bajty; jako jediné podání třem adresátům se použije PDF č. 067 s příponou `.pdf`. Inventura všech vstupů a SHA-256 je v `justice-slalom-upload-reconciliation-2026-09-28.json`, automatická brána hlídá 82 jedinečných podání z dávky a chybějící archivní čísla.
- **Datace rozhoduje podle vlastního obsahu podání:** Č. 019 má v názvu 14. 9., ale v záhlaví i podpisu 13. 9. 2026; č. 074 má v názvu rok 2024, ale v textu 25. 8. 2026; samostatné PDF č. 082 má v názvu 26. October, ale v textu 26 September 2026. Č. 077 uvádí v záhlaví 24. 9., v datu vlastního dopisu 25. 9. 2026. Tyto rozdíly zůstávají pouze v interní evidenci, bez veřejných vysvětlivek; PDF zůstávají beze změny.
- **Kořenová příčina předchozích poznámek:** Datum vysvětlující pole byla součástí veřejně renderovaných metadat. Nový přírůstek uchovává pouze kanonické datum podle primárního textu, veřejný generátor nemá cestu k interním vysvětlivkám a finální validace odmítá jejich návrat.
- **P0 brána ochrany třetích osob během přípravy dávky:** Inventura textu odhalila v originálních souborech č. 015, 021, 050, 072 a 075 plná jména s daty narození a v č. 021 též adresy třetích osob; č. 050 a 075 popisují jejich zdravotní stav. Algoritmus v8 a axiom `third-person-lawful-anonymization` vyžadují zákonnou anonymizaci a lidskou kontrolu před veřejným vydáním. Veřejná distribuce nových PDF se do vyřešení této brány pozastavuje. Pojistka: zdrojový screening citlivých údajů a schválená veřejná verze pro každé dotčené PDF ještě před PR; u neidentické kopie musí být označení pravdivé. Interní příprava a lokální validace mohou pokračovat.
- **Opakované hlášení obrácené chronologie 28. září:** Autor i po červencovém nasazení vidí sestupné pořadí. Přímá kontrola aktuálního HTML veřejné tabulky ověřuje řádky 1–65 od 2. července do 1. srpna vzestupně, ale sousední seznam „Nejnovější ověřené listiny“ zobrazuje na začátku nejnovější státní listiny a aktuální dávka srpen–září dosud nebyla nasazena. Pojistka: po dokončení dávky kontrolovat šest veřejných stránek v DOM i viditelném rozhraní, odlišit archiv podání od sousedního seznamu a výsledek hlásit s konkrétními daty a URL. Nenasazenou změnu neslibovat jako hotovou.
- **P0 preflight byl při opakovaném zaslání v8 přeskočen:** Po novém přiložení stejného závazného dokumentu byly do pracovního stromu zapsány dvě přípravné změny ještě před jeho opětovným přečtením. Stav byl okamžitě vrácen do `BLOCKED/preflight`; před jakýmkoli dalším zápisem se znovu přečetl v8, aktuální `main` (55db281), publikované axiomy, paměť chyb, cíle, architektura, generátory a obě workflow. Kořenová příčina: předchozí přečtení se chybně považovalo za platné i pro nově zaslanou přílohu. Pojistka: explicitní ruční P0 checklist vždy po novém přiložení algoritmů před prvním zápisem; tuto pořadovou podmínku nelze poctivě doložit kontrolou samotného výstupu buildu. Produkční kontrola až po standardním nasazení.
- **Sémantická duplicita stávajících záznamů:** První lokální sestavení zařadilo 24 už dříve evidovaných podání znovu pod novými ID. Kontrola originálních PDF a názvů kanonických záznamů odhalila první rozchod mezi inventurou a kanonickou registrací, přestože technická validace 129/189 prošla. Kořenová příčina: prvotní deduplikace pracovala jen s bajtovým SHA-256 a ignorovala starší evidenční stránku nebo veřejnou kopii téhož podání. Oprava: zachovat původní ID, procesní vazby a překlad, doplnit k existujícímu záznamu exact PDF a adresáty; nový supplement obsahuje jen dosud neevidovaná podání. Automatická brána kontroluje 82 vstupů proti 82 jedinečným kanonickým ID a úplnému manifestu. Po finální produkci ověřit odvozené počty.
- **Zastaralý archiv vstoupil do mezikroku buildu:** Po odstranění neunonymizovaných originálů předchozí lokální HTML stále odkazovalo na jejich staré cesty. Audit PDF a následně kontrola interních odkazů selhaly dřív, než terminální generátor vytvořil aktuální archiv. První rozchod byl v převzatém veřejném HTML, kanonický registr už ukazoval na veřejné kopie. Oprava v jediném buildu: odstranit dříve vygenerovaný archiv na šesti plochách před mezikrokovými validacemi, na konci vytvořit aktuální archiv z kanonických dat a ověřit všechna PDF a 189 řádků. Produkční kontrola po vydání.
- **Staré PDF override přepsaly přesné soubory z nové dávky:** Jedenáct již evidovaných podání mělo `pdf-link-overrides.json` ukazující na starší obsahově shodné soubory. Reconciliation přepsala nové kanonické cesty a hash z uživatelského ZIPu přestal odpovídat výsledku. Oprava: všech jedenáct override nyní míří na konkrétní vložený PDF soubor s jeho SHA-256; staré URL zůstávají pro zpětné odkazy. Koncový validator porovnává skutečně publikované bajty s inventurou každého podání.
- **Brána reakcí očekávala pevné staré názvy PDF:** Přesné nové originály změnily aktivní cesty navazujících podání v položkách 13, 47, 56 a 67 Godota, zatímco kontrola měla jejich staré názvy ručně v kódu. Oprava: odvozovat očekávané cesty z kanonických `document_id` a inventury uploadů; stále kontrolovat počet a vazby reakcí.
- **Brána veřejných popisků zahrnula jinou komponentu:** Procesní chronologie správně používá „Dokument v PDF“, avšak oddělený archiv pravdivě označuje anonymizovanou veřejnou kopii. Kontrola procesních popisků omylem vyhodnotila také archiv. Oprava: procesní gate se vztahuje pouze na chronologii, archivní gate samostatně kontroluje správný druh PDF a jeho popisek v každém řádku.
- **Lidská kontrola anonymizovaných kopií je blokující krok:** Devět veřejných verzí má samostatný původní SHA-256, veřejný SHA-256, pravdivý popisek a manifest se stavem `pending_author_review`; žádná nebyla schválena. Koncový publikační validátor nyní bez výslovného schválení autora vydání zastaví; režim `--prepare-only` dovoluje ověřit strukturu balíku bez tvrzení o vydání. Kontrolní seznam a cesty jsou v `justice-slalom-privacy-review-2026-09-28.md`.
- **Sedm neanonymizovaných pomocných kopií zůstalo v pracovním veřejném stromu:** Inventura veřejných PDF podle původního SHA-256 našla při přípravě č. 017, 018, 021, 046, 050, 072 a 075 jako neodkazované originály vedle veřejných kopií. První rozchod byl v binárních artefaktech `web/documents`, nikoli v HTML odkazech. Před vydáním byly tyto pracovní soubory odstraněny; originály zůstávají v uživatelem dodaném archivu. Pojistka: terminální validator hashuje všechna veřejná PDF a odmítne kterýkoli z devíti citlivých původních hashů i v neodkazovaném souboru.

## 29. 9. 2026 – dokončení dávky a dvě nové státní listiny

- **Rozdíl mezi čistým validačním a produkčním buildem:** Čistý snapshot odhalil historické duplicitní nadpisy, protože validační workflow vynechávalo existující produkční cleanup. Opakovaný místní build je už měl odstraněné, a proto chybu skrýval. Oprava: stejný cleanup bezprostředně za kanonickým buildem v obou workflow a kontrola z čistého snapshotu před PR.

- **Autorská kontrola byla neprávem přenesena na uživatele:** Uživatel výslovně uložil kontrolu asistentovi. Pro tuto dávku je vyžadována doložená redakční kontrola všech stran a hashů; stav nikdy neuvádí neprovedenou lidskou kontrolu ani schválení autorem.
- **Pádové tvary jmen prošly prvním seznamem přesných řetězců:** Nalezeny další tvary příjmení a související identifikátory v devíti připravených kopiích. Příčina: screening pouze základních tvarů. Oprava: rozšířené hledání kořenů jmen, kontrola všech 80 stran, render a pixelové porovnání mimo začernění. Výsledek a SHA jsou v manifestu.
- **Git push není v tomto prostředí autentizovaný:** Zkušební dry-run skončil chybou chybějícího uživatelského jména. Použije se existující konektor GitHub, textové transportní bloky binárního balíku a deterministická materializace se SHA-256 každého bloku, archivu i výsledného PDF. Binární upload přes konektor se neopakuje.
- **Nová listina KSZ musí uzavřít starou fázi:** Kanonický dokument 1 KZT 475/2026-71 výslovně pojmenovává uzavřený časovač; generátor uchovává rozhodnutou historii a terminální gate odmítne aktivní starou fázi. Samostatný přezkum 1 KZN 1079/2026 se tím neuzavírá.

- **Prohlížeč přepisoval terminální chronologii:** Po vydání PR #80 byl finální HTML i gh-pages správný, ale živý DOM po načtení dvou variant `document-chronology.js` znovu uváděl „originál PDF“, odstranil uzly řízení a u KSZ 1 KZT 475/2026-71 ztratil tři předchozí podání. První divergence nastala v klientském renderu, který používal starší model vztahů než kanonický build. Oprava: generátor odstraní všechny verzované i neverzované reference tohoto rendereru; kompatibilní JS na staré URL už nic nepřepisuje. Brána: po všech generátorech odmítnout renderer na každém veřejném HTML, ověřit závazné CZ/EN PDF popisky, obě vazby na řízení a všechny tři předchozí podání KSZ. Produkční regrese: ověřit stejná pole ve skutečném DOM po načtení a rozbalení archivu, nikoli pouze ve zdroji HTML.
- **Kontrola cílů odkazů odhalila kolizi starého ID:** `build-process-timers.mjs` po vytvoření chronologie odstraňoval sekci `rizeni-online` jako historický blok, přestože nový generátor totéž ID používal pro kanonický rozcestník řízení. Tato druhá divergence vznikala už v buildu. Rozcestník dostal vlastní ID `chronology-case-index`; terminální brána nových listin ověřuje nejen `href`, ale i existenci cílového ID.

- **Anglická karta zaměnila adresáta za autora podání:** Živý DOM uvedl u vlastního podání z 13. 9. 2026 „From: Brno Regional Court“. Příčina: fallback z obecného `institution_id`, které u novějších podání určuje adresáta. Oprava: autora převzít pouze z doloženého `author_en`, procesního aktéra nebo subjektu typu osoba/spolek; jinak nevyplňovat nedoloženou roli. Terminální gate odmítá veřejný orgán jako autora vlastní odchozí karty.
- **KPR 29. 9. 2026 není nové rozhodnutí o milosti:** Datum plyne z viditelného elektronického podpisu, nikoli z názvu souboru. Potvrzení dvou podání a odmítnutí účasti u zasedání nepřeměňovat na příslib konkrétního termínu milosti. Původní stížnost zůstává vyřízená 2. 9.; kanonická projekce připojí odpověď 29. 9. do téže genealogie a odstraní číselnou lhůtu z aktuální fáze. Nezávislá informační větev KPR 5772/2026 se nemění. Gate ověřuje poslední pramen, historii a nulovou novou pevnou lhůtu.


### „Právě teď“ se mohlo znovu zaseknout na ručně vedeném posledním článku

- Projev: build správně nastavil odkaz na nejnovější skutečně publikovaný soubor článku, ale klientský `news-feed.js` jej po načtení stránky znovu přepsal podle ručně vedeného pole `cannaNews`. Nový článek by proto mohl existovat a navigace by stále otevírala starší report.
- Příčina: existovaly dva zdroje pravdy pro stejný navigační odkaz.
- Závazné řešení: jediným zdrojem pro „Právě teď“ je build, který skenuje skutečné články `web/zpravy/DDMMYYYY-NNN.html` a vybere nejnovější datum/číslo. Klientský JavaScript nesmí atribut `href` prvku `data-nav-latest-report` měnit.
- Pojistka: validační skript ověřuje, že statický odkaz míří na nejnovější článek a současně odmítne návrat klientského přepisu. Seznam „Aktivní soudní řízení“ navíc nesmí obsahovat pouhé preventivní podání bez soudní spisové značky; povinně kontroluje známé spisové značky z aktuálního zadání.

### Státu lásky čas nesmí kopírovat obsah Justičního slalomu

- **Projev:** Po sjednocení tabulkového vzhledu byly do Státu lásky čas chybně vloženy jako samostatné hlavní řádky také naše vlastní podání. Tím se zaměnil smysl dvou veřejných registrů a tabulka byla navíc vizuálně pouze přibližná, nikoli skutečně totožná s Justičním slalomem.
- **Příčina:** Generátor filtroval dohromady `incoming_from_state_or_public_institution` i `outgoing_from_user_or_alliance` a vlastní podání považoval za plnohodnotné chronologické řádky. Vizuál současně nepoužil celý obal a CSS kontrakt Justičního slalomu.
- **Závazná náprava:** Hlavní řádky Státu lásky čas tvoří pouze příchozí reakce veřejných, státních a mezinárodních/EU orgánů. Naše podání se smějí objevit pouze vztahově: ve sloupci **Na co orgán reaguje** a ve sloupci **Námitka / opravný prostředek**, vždy s aktivním odkazem, je-li PDF veřejně dostupné. Vizuál tabulky musí sdílet stejné třídy a stejné CSS vlastnosti jako Justiční slalom; odlišuje se pouze počtem sloupců.
- **Pojistka:** Build selže, pokud hlavní tabulka Státu lásky čas obsahuje řádek s `submission_side=outgoing_from_user_or_alliance`, pokud počet hlavních řádků neodpovídá kanonickému počtu příchozích reakcí, pokud chybějí sloupce vztahů, nebo pokud tabulka není vložena do stejného `justice-slalom` vizuálního wrapperu. CZ a EN se kontrolují položku po položce a nejnovější reakce zůstává nahoře, zatímco nejstarší má číslo 1.

### Státu lásky čas nesmí zdědit úzký 760px článek

- **Projev:** tabulka Státu lásky čas byla přibližně na polovinu šířky stránky, zatímco Justiční slalom používal celý page shell.
- **Příčina:** panel byl vložen uvnitř `.article-body`, která je na desktopu první buňkou dvousloupcové mřížky `.article-layout` s maximem 760 px. Pravidlo `width:100%` proto znamenalo 100 % úzkého textového sloupce, nikoli 100 % hlavního page shellu.
- **Náprava:** `.article-body` obsahující `.state-love-shell` musí přes `grid-column:1/-1` zabrat celou šířku mřížky; samotný panel pak může bezpečně zůstat na `width:100%` a geometricky odpovídá Justičnímu slalomu.
- **Pojistka:** publikační validátor musí ověřit existenci full-width grid pravidla a nesmí připustit návrat Státu lásky čas do 760px sloupce.

