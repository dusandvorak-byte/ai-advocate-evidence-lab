import { readFile, readdir, writeFile } from 'node:fs/promises';

const reportFiles = (await readdir('web/zpravy')).filter(name => /^\d{8}-\d+\.html$/.test(name));
const reportKey = name => {
  const m = name.match(/^(\d{2})(\d{2})(\d{4})-(\d+)\.html$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}-${String(m[4]).padStart(6,'0')}` : '';
};
const latest = [...reportFiles].sort((a,b) => reportKey(a).localeCompare(reportKey(b))).at(-1);
if (!latest) throw new Error('PRIMARY-NAV: nelze určit poslední publikovaný článek');
const englishLatest = `web/news/${latest}`;
try { await readFile(englishLatest, 'utf8'); } catch { throw new Error(`PRIMARY-NAV: poslední článek nemá anglickou stránku ${englishLatest}`); }

const update = async (path, english=false) => {
  let html = await readFile(path,'utf8');
  const nav = english
    ? `<nav class="nav"><a href="news/${latest}">Right now</a><a href="news/index.html">News archive</a><a href="#active-court-proceedings">Active court proceedings since 1 May 2026</a><a href="#support">Support</a></nav>`
    : `<nav class="nav"><a href="zpravy/${latest}">Právě teď</a><a href="zpravy/index.html">Archiv zpráv</a><a href="#active-court-proceedings">Aktivní soudní řízení od 1. května 2026</a><a href="#podpora">Podpořit</a></nav>`;
  if (!/<nav class="nav">[\s\S]*?<\/nav>/.test(html)) throw new Error(`PRIMARY-NAV: ${path} nemá hlavní nav`);
  html = html.replace(/<nav class="nav">[\s\S]*?<\/nav>/, nav);
  await writeFile(path,html,'utf8');
};
await update('web/index.html',false);
await update('web/en.html',true);
console.log(`PRIMARY-NAV: Právě teď / Right now → ${latest}; Archiv + Aktivní soudy + Podpořit zachovány; Lhůty a Ověřit listinu odstraněny z první lišty.`);
