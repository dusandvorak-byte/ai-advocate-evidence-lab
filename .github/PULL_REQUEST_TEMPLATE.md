## Co se mění

<!-- Stručně popište změnu a její dopad na čtenáře. -->

## Zdrojová a právní hranice

- [ ] Každé nové faktické tvrzení má přesný veřejný zdroj nebo doslovnou citaci.
- [ ] Fakta, pracovní výklad, nejistoty a návrhy dalších kroků jsou oddělené.
- [ ] Postoupení, předání, prověřování, dohled ani zahájení řízení nejsou vydávány za potvrzení protiprávnosti.
- [ ] Nová nebo změněná listina byla zkontrolována na osobní údaje, anonymizaci a právo ke zveřejnění.
- [ ] Neveřejný odkaz, token, přihlašovací údaj ani pracovní originál není součástí diffu.

## Publikace

- [ ] Změna existujícího reportu má výslovně zvýšenou verzi v `web/publication-manifest.json`.
- [ ] Nový report je v archivu, sdíleném feedu a publikačním manifestu.
- [ ] Veřejné odkazy a SHA-256 odpovídají souborům určeným ke zveřejnění.

## Kontroly

- [ ] `node --test test/*.test.mjs`
- [ ] `node tools/build-publication-manifest.mjs --check`
- [ ] `node tools/check-public-sources.mjs`
- [ ] Diff neobsahuje nesouvisející změny.

## Lidské schválení

<!-- Uveďte, kdo porovnal citace, ověřil soukromí a zkontroloval právní výklad. -->
