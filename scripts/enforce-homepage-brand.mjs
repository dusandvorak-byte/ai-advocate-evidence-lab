import { readFile, writeFile } from 'node:fs/promises';

const path = 'web/index.html';
const tagline = 'Reportér důkazů kartelu, korupce a zločinů státu ve věci konopí';
let html = await readFile(path, 'utf8');

const brandRe = /(<a class="brand" href="index\.html"><b>CannaInsider\.EU<\/b><span(?: class="brand-tagline")?>)[^<]*(<\/span><\/a>)/;
if (!brandRe.test(html)) throw new Error('Titulní strana nemá očekávanou značku CannaInsider.EU');
html = html.replace(brandRe, `$1${tagline}$2`).replace('<span>Reportér důkazů kartelu', '<span class="brand-tagline">Reportér důkazů kartelu');

const style = '<style id="brand-tagline-layout">.masthead .brand{align-items:flex-start}.masthead .brand .brand-tagline{max-width:560px;font-size:clamp(12px,1.45vw,17px);line-height:1.18;letter-spacing:.045em;text-transform:none;font-weight:800}@media(max-width:760px){.masthead .brand .brand-tagline{max-width:100%;font-size:13px;line-height:1.25}}</style>';
html = html.replace(/\s*<style id="brand-tagline-layout">[\s\S]*?<\/style>/g, '');
if (!html.includes('</head>')) throw new Error('Titulní strana nemá </head>');
html = html.replace('</head>', `${style}</head>`);
if (!html.includes(tagline)) throw new Error('Nepodařilo se vynutit podtext CannaInsider.EU');

await writeFile(path, html, 'utf8');
console.log(`Titulní značka: ${tagline}`);
