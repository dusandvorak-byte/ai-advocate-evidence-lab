import { readFile, writeFile } from 'node:fs/promises';

const reportId = '11092026-013';
const czTitle = 'Zakázat legální konopí a legalizovat trestnou činnost policie?';
const enTitle = 'Ban legal cannabis and legalise unlawful police conduct?';
const image = 'assets/votruba/zpivej-kopie.jpg';
const czSummary = 'Autorský komentář k bodu vlády č. 684/26, CBD, THCA a dlouhodobě namítané praxi policejních znaleckých pracovišť; tvrzení o protiprávnosti jsou tvrzení autora.';
const enSummary = 'Authorial commentary on Government item 684/26, CBD, THCA and disputed police forensic practice; allegations of unlawful conduct are attributed to the author.';

async function patch(path, fn) {
  const before = await readFile(path, 'utf8');
  const after = fn(before);
  if (after !== before) await writeFile(path, after, 'utf8');
}

await patch('web/news-feed.js', html => {
  if (html.includes(`id: '${reportId}'`)) return html;
  const item = `\n  {\n    id: '${reportId}',\n    dateCs: '11. 9. 2026',\n    dateEn: '11 September 2026',\n    score: 'SOURCE-LINKED',\n    titleCs: '${czTitle}',\n    titleEn: '${enTitle}',\n    summaryCs: '${czSummary}',\n    summaryEn: '${enSummary}',\n    keywordsCs: 'vláda 684/26 konopí CBD THCA THC policie znalecké metody MSp ČIA',\n    keywordsEn: 'Czech Government 684/26 cannabis CBD THCA THC police forensic methods Ministry of Justice accreditation',\n    href: 'zpravy/${reportId}.html',\n    hrefEn: 'news/${reportId}.html'\n  },`;
  return html.replace('const cannaNews = [', `const cannaNews = [${item}`);
});

await patch('web/zpravy/index.html', html => {
  if (html.includes(`zpravy/${reportId}.html`)) return html;
  const card = `<article class="archive-item"><time datetime="2026-09-11">11. 9. 2026</time><div><p class="kicker">AUTORSKÝ KOMENTÁŘ · REPORT ${reportId} · ZDROJOVĚ PROPOJENO</p><h2><a href="zpravy/${reportId}.html">${czTitle}</a></h2><p>${czSummary}</p></div></article>`;
  return html.replace('<section class="archive-list">', `<section class="archive-list">\n      ${card}`);
});

await patch('web/news/index.html', html => {
  if (html.includes(`news/${reportId}.html`)) return html;
  const card = `<article class="archive-item"><time datetime="2026-09-11">11 September 2026</time><div><p class="kicker">AUTHORIAL COMMENTARY · REPORT ${reportId} · SOURCE-LINKED</p><h2><a href="news/${reportId}.html">${enTitle}</a></h2><p>${enSummary}</p></div></article>`;
  return html.replace('<section class="archive-list">', `<section class="archive-list">\n      ${card}`);
});

const czLead = `<section class="newsroom-alert" id="prave-ted"><b>HLAVNÍ ZPRÁVA</b><span>${czSummary}</span><a href="zpravy/${reportId}.html">Číst celý článek →</a></section><section class="news-lead"><article class="lead-card"><figure><img src="${image}" alt="Ilustrace Jiřího Votruby"><figcaption>Jiří Votruba</figcaption></figure><div><p class="kicker">CANNAINSIDER NEWS · 11. 9. 2026 · REPORT ${reportId}</p><h1><a href="zpravy/${reportId}.html">${czTitle}</a></h1><p class="standfirst">${czSummary}</p><div class="news-meta"><span>11. 9. 2026</span><span>Autorský komentář</span><span>Jiří Votruba</span></div></div></article></section>`;
const enLead = `<section class="newsroom-alert" id="now"><b>MAIN STORY</b><span>${enSummary}</span><a href="news/${reportId}.html">Read the report →</a></section><section class="news-lead"><article class="lead-card"><figure><img src="${image}" alt="Illustration by Jiří Votruba"><figcaption>Jiří Votruba</figcaption></figure><div><p class="kicker">CANNAINSIDER NEWS · 11 SEPTEMBER 2026 · REPORT ${reportId}</p><h1><a href="news/${reportId}.html">${enTitle}</a></h1><p class="standfirst">${enSummary}</p><div class="news-meta"><span>11 September 2026</span><span>Authorial commentary</span><span>Jiří Votruba</span></div></div></article></section>`;

await patch('web/index.html', html => {
  html = html.replace(/<section class="newsroom-alert" id="prave-ted">[\s\S]*?<\/section><section class="news-lead">[\s\S]*?<\/section>/, czLead);
  return html;
});
await patch('web/en.html', html => {
  html = html.replace(/<section class="newsroom-alert" id="now">[\s\S]*?<\/section><section class="news-lead">[\s\S]*?<\/section>/, enLead);
  return html;
});

const churchCzLead = `<article class="lead-story"><div class="story-image"><img src="/ai-advocate-evidence-lab/${image}" alt="Ilustrace Jiřího Votruby"><span>Jiří Votruba</span></div><div class="story-copy"><p class="kicker">ZPRÁVA DNE · 11. 9. 2026 · REPORT ${reportId}</p><h1><a href="/ai-advocate-evidence-lab/zpravy/${reportId}.html">${czTitle}</a></h1><p class="standfirst">${czSummary}</p><div class="facts"><p><b>Redakční hranice:</b> tvrzení o protiprávním či trestném jednání jsou tvrzení autora, nikoli pravomocné závěry orgánů veřejné moci.</p></div></div></article>`;
const churchEnLead = `<article class="lead-story"><div class="story-image"><img src="/ai-advocate-evidence-lab/${image}" alt="Illustration by Jiří Votruba"><span>Jiří Votruba</span></div><div class="story-copy"><p class="kicker">STORY OF THE DAY · 11 SEPTEMBER 2026 · REPORT ${reportId}</p><h1><a href="/ai-advocate-evidence-lab/news/${reportId}.html">${enTitle}</a></h1><p class="standfirst">${enSummary}</p><div class="facts"><p><b>Editorial boundary:</b> allegations of unlawful or criminal conduct are attributed to the author and are not final findings by public authorities.</p></div></div></article>`;
await patch('web/kc/index.html', html => html.replace(/<article class="lead-story">[\s\S]*?<\/article>/, churchCzLead));
await patch('web/kc/en.html', html => html.replace(/<article class="lead-story">[\s\S]*?<\/article>/, churchEnLead));

for (const [path, needle] of [
  ['web/index.html', `zpravy/${reportId}.html`], ['web/en.html', `news/${reportId}.html`],
  ['web/kc/index.html', `zpravy/${reportId}.html`], ['web/kc/en.html', `news/${reportId}.html`],
  ['web/zpravy/index.html', `zpravy/${reportId}.html`], ['web/news/index.html', `news/${reportId}.html`]
]) {
  const text = await readFile(path, 'utf8');
  if (!text.includes(needle)) throw new Error(`Release gate: ${path} postrádá ${needle}`);
}
for (const path of ['web/zpravy/11092026-013.html','web/news/11092026-013.html','web/assets/votruba/zpivej-kopie.jpg']) {
  try { await readFile(path); } catch { throw new Error(`Release gate: chybí ${path}`); }
}
console.log('Release 2026-09-16: report 11092026-013 synchronized on CannaInsider CZ/EN and Church of Cannabis CZ/EN.');
