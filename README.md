# AI Advocate Evidence Lab

Samostatný projekt vznikající po uzávěrce OpenAI Build Week. Původní soutěžní repozitář ani jeho archiv nemění.

Veřejný web se nasazuje pouze z adresáře `web` prostřednictvím GitHub Pages.

The project is a separate post-submission evidence laboratory. It does not modify the original competition repository or submission archive.

## Zpravodajský režim

- Česká titulní strana je `web/index.html`, anglická `web/en.html`.
- Každá schválená novinka má trvalou stránku v `web/zpravy/` a záznam v chronologickém archivu.
- Anglické zprávy a archiv jsou v `web/news/`.
- Nové redakční tvrzení se nezveřejňuje bez schválení autora. Překlady zachovávají stejnou důkazní hranici.
- Semafor vyjadřuje relevanci, naléhavost a potřebu kontroly. Neurčuje vinu, výsledek řízení ani nenahrazuje právní radu.
- Místní důkazní přepážka pracuje v prohlížeči s digitálním otiskem. Neznámá listina nepřevezme připravené závěry jiné kauzy; `0/0` dostane jen tehdy, když se v jejím místně přečteném textu nenajde rozpoznaná vazba na veřejnou paměť.
- Přepážka přijímá také přímý HTTPS odkaz na veřejné PDF. Prohlížeč je stáhne přímo ze zdrojového serveru bez přihlašovacích údajů a bez refereru, ověří podpis PDF a limit 30 MB a teprve potom je místně analyzuje. Zdroj musí povolit stažení z jiného webu (CORS); GitHub Pages tuto ochranu cizího serveru nemůže obejít.
- Přesně známá listina se vyhodnotí podle otisku SHA-256. U neznámého PDF pevně verzovaná knihovna Mozilla PDF.js (`4.8.69`) místně získá text a transparentní klasifikátor změří shodu tématu, spisových značek, institucí a veřejných uzlů paměti. Knihovna se načítá z veřejného CDN, ale dokument neopouští prohlížeč. Orientační skóre není právním závěrem ani předpovědí výsledku.
- PDF bez čitelné textové vrstvy nedostane `0/0`; rozhraní vysvětlí, že je nejprve nutné OCR. Přesná shoda otisku, orientační textová shoda a právní posouzení jsou tři odlišné věci.
- Čitelný dokument dostane čtyři oddělené skupiny výstupu: doložená fakta, pracovní zařazení a výklad, nejistoty a návrhy řešení či dalších kontrol. Každá položka obsahuje přesnou citaci z analyzovaného textu; známá spisová značka zakládá jen předběžný uzel mapy, nikoli potvrzení procesního vztahu, pochybení nebo výsledku.
- Návrhy řešení jsou kontrolní pracovní kroky podle rozpoznaného typu listiny. Prototyp nedopočítává právní lhůty, nepovažuje postoupení za potvrzení protiprávnosti a před použitím vyžaduje lidskou právní kontrolu.
- Obě jazykové verze CannaInsider.EU i Konopné církve používají jeden místní vyhledávač zpráv a spisových značek. Vyhledávání nic neodesílá.
- Dobrovolnou podporu Educational Cannabis Clinic zobrazuje samostatná QR sekce. Logo aliance je na civilním webu pouze v patičce; Konopná církev používá vlastní tmavě modrou identitu.

## Kontroly

```text
node --test test/*.test.mjs
```

Stejné kontroly běží před nasazením GitHub Pages. Ověřují zejména hranici mezi přesnou totožností a orientační relevancí, citaci každého dílčího závěru přímo ze zdroje, odmítnutí nebezpečných nebo neplatných externích adres, neutrální zacházení s procesním postoupením, nepřítomnost nezveřejněné kauzy L. CH., úplnost společného vyhledávače, neduplikování hlavních zpráv, bezpečné označení sledovaných termínů, mobilní čitelnost, QR sekci a nasazení pouze adresáře `web`.

## Historie webu

Web CannaInsider.EU / AI Advocate Evidence Lab byl vytvořen 20. července 2026. Datum v horní liště titulních stran se zobrazuje automaticky podle aktuálního dne v časovém pásmu Europe/Prague; data jednotlivých zpráv zůstávají neměnnými daty jejich zveřejnění.
