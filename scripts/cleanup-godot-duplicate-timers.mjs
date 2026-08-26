import { readFile, writeFile } from 'node:fs/promises';

const path = 'web/zpravy/04082026-010.html';
let html = await readFile(path, 'utf8');

const timerEnd = '<!-- PROCESS-TIMERS:END -->';
const deadlines = '<section id="lhuty-a-necinnost"';
const generatedEnd = html.indexOf(timerEnd);
if (generatedEnd < 0) throw new Error('Godot: chybí konec generovaného bloku časovačů');

const staleStartCandidates = [
  '<h3>Předžalobní a předprocesní výzvy',
  '<h3>Správní a informační řízení',
  '<h3>Přezkumy a dohledy',
  '<h3>Historická trestní důkazní větev',
  '<h3>Historický společný referenční bod vědomosti státu'
];

let staleStart = -1;
for (const marker of staleStartCandidates) {
  const pos = html.indexOf(marker, generatedEnd + timerEnd.length);
  if (pos >= 0 && (staleStart < 0 || pos < staleStart)) staleStart = pos;
}

if (staleStart >= 0) {
  const deadlinesStart = html.indexOf(deadlines, staleStart);
  if (deadlinesStart < 0) throw new Error('Godot: nalezen duplicitní blok časovačů, ale chybí sekce lhůt');
  html = html.slice(0, staleStart) + html.slice(deadlinesStart);
}

const occurrences = marker => (html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
for (const marker of staleStartCandidates) {
  const count = occurrences(marker);
  if (count > 1) throw new Error(`Godot: po cleanup zůstává duplicitní nadpis ${marker}: ${count}x`);
}

await writeFile(path, html, 'utf8');
console.log('Godot duplicate timer cleanup complete.');
