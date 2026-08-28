# Doplněk registru chyb — 28. 8. 2026

## Merge do `main` před úspěšnou kontrolou úplné CZ/EN parity

- **Projev:** Nová listina Městského soudu v Praze č. j. 8 Ad 9/2026-85 byla správně zapsána do kanonických českých dat a její veřejná PDF kopie byla úspěšně vytvořena, ale produkční build se zastavil na chybě `Missing English document description: doc-cz-ms-pha-2026-08-28-8-ad-9-2026-85`. Změna už přitom byla sloučena do `main`, takže web zůstal na předchozí produkční verzi.
- **Příčina:** Byla porušena publikační posloupnost: PR byl sloučen před dokončením a ověřením validačního workflow. Současně byl seznam překladových supplementů v `prepare-md-english-build.mjs` udržován ručně, takže nově založený překladový supplement mohl být opomenut.
- **Oprava:** Doplnit anglický popis listiny 8 Ad 9/2026-85. Překladové supplementy načítat automaticky podle názvu souboru `english-godot-translations-YYYY-MM-DD*.json`, nikoli z ručně udržovaného seznamu.
- **Tvrdá pojistka:** Každý PR měnící kanonické dokumenty, překlady, Godot nebo publikační skripty musí před mergem úspěšně dokončit celý validační build včetně generování anglického Godota. Stav `mergeable` sám o sobě není dostatečný. Bez výsledku `success` se PR nesmí sloučit.
- **Regresní test:** Build musí pro každý kanonický dokument od 1. 5. 2026 ověřit existenci anglického popisu. Jediný chybějící překlad musí zastavit PR validaci ještě před mergem. Produkční workflow je až druhá, nikoli první kontrolní vrstva.

## Závazný algoritmus před mergem

1. Načíst aktuální `main` a vytvořit izolovanou pracovní větev.
2. Zapsat nový dokument do kanonického registru a manifestu zdrojů.
3. Současně vytvořit odpovídající EN překladový supplement.
4. Zkontrolovat diff a duplicity.
5. Otevřít PR.
6. **Počkat na úplné dokončení validačního workflow.**
7. Ověřit, že validační workflow skončilo `success`, včetně `build-english-godot.mjs` a kontroly počtu CZ/EN položek.
8. Teprve potom merge do `main`.
9. Ověřit produkční workflow, `gh-pages`, `.source-commit`, českou položku, anglickou položku a aktivní PDF.
10. Teprve poté použít formulaci „zveřejněno / hotovo / nasazeno“.

Tato chyba má nejvyšší prioritu, protože vedla k rozdílu mezi stavem `main` a skutečně zveřejněnou produkcí.
