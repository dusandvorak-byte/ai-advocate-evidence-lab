import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('./',import.meta.url);
const [html,css,js]=await Promise.all(['index.html','style.css','app.js'].map(x=>readFile(new URL(x,base),'utf8')));
test('standalone demo routes and accessibility controls exist',()=>{
 for(const token of ['id="page-prehled"','id="page-dokumenty"','id="page-detail"','id="page-workflow"','id="theme-toggle"','aria-pressed="false"','id="search"','id="status"','class="skip"','role="status"'])
  assert.ok(html.includes(token),token);
 assert.match(js,/window\.addEventListener\('hashchange',navigate\)/);
 assert.match(js,/localStorage\.setItem/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:root\[data-theme=dark\]/);
 assert.match(css,/@media\(max-width:760px\)/);
});
test('only demo data are rendered; no real PDF or private registry fetch',()=>{
 assert.match(html,/UKÁZKOVÝ ZÁZNAM/);
 assert.match(js,/DEMO-001/);
 assert.match(js,/Není připojeno/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|\.pdf\b|api\.github\.com|project-memory|web\/documents/);
 assert.doesNotMatch(html,/src="https?:|<iframe|<object|<embed|<form[^>]+method="post"/);
});
test('light by default, dark available, no direct production file impact',()=>{
 assert.match(html,/<html lang="cs" data-theme="light">/);
 assert.match(css,/--green:#176e36/);
 assert.match(js,/theme==='light'\?'dark':'light'/);
});
