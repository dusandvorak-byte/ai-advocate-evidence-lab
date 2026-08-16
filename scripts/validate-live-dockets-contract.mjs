import { readFile } from 'node:fs/promises';

const home = await readFile('web/index.html', 'utf8');
const styles = await readFile('web/home-rollups.css', 'utf8');
const compatibility = await readFile('web/live-dockets.js', 'utf8');

const rollupCount = (home.match(/data-home-rollup=/g) || []).length;
if (rollupCount !== 6) throw new Error(`Očekáváno šest hlavních lišt, nalezeno ${rollupCount}`);
if ((home.match(/id="home-rollup-stack"/g) || []).length !== 1) throw new Error('Chybí jediný kanonický zásobník šesti lišt');
for (const id of ['court','pretrial','state-love','latest','godot','lead']) {
  if (!home.includes(`data-home-rollup="${id}"`)) throw new Error(`Chybí lišta ${id}`);
}
if (home.includes('class="edition-bar"') || /Aktualizováno\s+\d/i.test(home)) throw new Error('Vrátila se odstraněná lišta aktualizace');
if (!home.includes('data-home-rollup="godot"') || !home.includes('href="zpravy/04082026-010.html#chronologie"')) throw new Error('Godot nemá přímý vstup do chronologie');
if (!home.includes('data-home-rollup="lead"') || !home.includes('href="zpravy/07082026-011.html"')) throw new Error('Zpráva dne nemá přímý vstup do reportu 07082026-011');
if (!styles.includes('grid-template-columns:minmax(0,1fr) minmax(220px,300px) 32px 106px')) throw new Error('Chybí jednotná čtyřsloupcová geometrie lišt');
if (!styles.includes('background:rgba(35,96,124,.56)') || !styles.includes('background:rgba(24,78,104,.68)')) throw new Error('Chybí olejově modrá barevná smlouva lišt');
if (!styles.includes('.home-rollup-stack .home-rollup-heavy')) throw new Error('Poslední tři lišty nemají zesílenou variantu');
if (!compatibility.includes("const cssHref = 'home-rollups.css'")) throw new Error('Kompatibilitní skript nenačítá kanonický styl');
if (compatibility.includes('document.createElement(\'section\')') || compatibility.includes('wrapper.append(')) throw new Error('JavaScript znovu dynamicky přepisuje titulní lišty');

console.log('Smlouva titulní stránky: přesně 6 staticky materializovaných lišt, jednotná geometrie, přímý Godot i report 07082026-011, bez JavaScriptového přepisování.');
