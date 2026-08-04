# Řízený proces CannaInsideru: od cizího PDF po veřejný výstup

## Bezpečnostní zásada

Neznámá listina smí získat pracovní klasifikaci a návrhy kontrol, ale nesmí převzít připravený právní závěr jiné listiny. Každá zobrazená položka musí obsahovat doslovnou citaci ze zdroje. Postoupení, předání, prověřování, dohled nebo zahájení řízení nejsou potvrzením protiprávnosti.

## Stavový proces

1. **Příjem:** člověk vloží místní PDF/text nebo přímý veřejný HTTPS odkaz. Prohlížeč odmítá přihlašovací a neveřejné adresy, ověřuje podpis PDF, limit 30 MB a počítá SHA-256.
2. **Vytěžení:** textové PDF se čte po stránkách. Sken bez textové vrstvy se nezpracuje jako nulová relevance; vyžádá OCR.
3. **Citovaná analýza:** systém oddělí fakta, pracovní výklad, nejistoty a návrhy dalších kontrol. Každá položka má citaci, stranu a míru jistoty.
4. **Pracovní balík:** uživatel může stáhnout JSON se zdrojem, otiskem a strukturovanou analýzou. Query a fragment externího URL se do balíku nepřenášejí.
5. **Lidská kontrolní brána:** kandidát publikace vyžaduje potvrzení citací, anonymizace a práv ke zveřejnění i lidskou kontrolu právního výkladu.
6. **GitHub issue:** veřejný formulář eviduje návrh práce. Do issue se nesmí vložit neveřejná listina ani tokenizovaný odkaz.
7. **Větev a pull request:** změna probíhá mimo `main`; PR checklist vyžaduje zdrojové, soukromé, právní a technické kontroly.
8. **Automatické kontroly:** testy ověřují důkazní hranice, veřejné odkazy, mobilní rozhraní a publikační manifest. CodeQL kontroluje JavaScript a GitHub Actions.
9. **Schválení a nasazení:** teprve sloučení zkontrolovaného PR do `main` spustí GitHub Pages. Nasazuje se pouze `web/`.
10. **Verzované vydání:** ruční workflow vytvoří GitHub Release z přesné verze reportu, připojených zdrojů a SHA-256. Oprava už zveřejněného reportu vyžaduje zvýšení verze.
11. **Následná kontrola:** denní workflow kontroluje zdrojové soubory i jejich skutečně nasazené adresy na GitHub Pages. Při poruše otevře nebo aktualizuje issue a po nápravě je uzavře.

## Co zůstává oddělené

Statický GitHub Pages web neumí univerzálně stáhnout zdroj, který blokuje CORS, ani bezpečně provést OCR skenu. To vyžaduje samostatnou službu s ochranou proti SSRF, limity, kontrolou přesměrování a retenčními pravidly; úkol je evidován v GitHub issue č. 4.

Automat nikdy nepočítá právní lhůtu jen z nalezeného data a sám nezveřejňuje dokument. Publikační kandidát je podklad pro kontrolovaný PR, nikoli publikace.
