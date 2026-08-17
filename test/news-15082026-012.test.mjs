import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const [article, feed, archive, churchSync, churchPage] = await Promise.all([
  readFile('web/zpravy/15082026-012.html', 'utf8'),
  readFile('web/news-feed.js', 'utf8'),
  readFile('web/zpravy/index.html', 'utf8'),
  readFile('scripts/sync-public-surfaces.mjs', 'utf8'),
  readFile('web/kc/index.html', 'utf8')
]);

assert.match(article, /REPORT 15082026-012/);
assert.match(article, /assets\/votruba\/write-lawmakers\.jpg/);
assert.match(article, /assets\/noc-basniku-21-srpna-ospelov\.jpg/);
assert.match(article, /autorskou satirickou stylizací/);
assert.match(article, /Podání ani jejich zveřejnění samy nepotvrzují pochybení/);
assert.doesNotMatch(article, /href="1\\\)%09https:/);

const pastoralLinks = [...article.matchAll(/<li><a href="([^"]+\.pdf)"[^>]*><em>([^<]+)<\/em><\/a><\/li>/g)];
assert.equal(pastoralLinks.length, 10, 'Desatero musí mít deset celých kurzívních aktivních odkazů');
for (const [_, href] of pastoralLinks) {
  const localPath = `web/${href.replace('/ai-advocate-evidence-lab/', '')}`;
  await access(localPath);
}

assert.match(article, /<a href="\/ai-advocate-evidence-lab\/zpravy\/22072026-002\.html"><b>Více o kauze 45 T 1\/2024 a námitkách aliance Cannabis is The Cure na CannaInsider\.EU<\/b><\/a>/);
assert.match(feed, /id: '15082026-012'/);
assert.match(archive, /REPORT 15082026-012/);
assert.match(churchSync, /zpravy\/15082026-012\.html/);
assert.equal((churchPage.match(/latest-records\.css/g) || []).length, 1, 'Církevní stránka smí načítat společný styl jen jednou');
assert.equal((churchPage.match(/auto-translate\.js/g) || []).length, 1, 'Církevní stránka smí načítat překladač jen jednou');

await access('web/assets/noc-basniku-21-srpna-ospelov.jpg');
console.log('Report 15082026-012: 10/10 PDF odkazů, Votruba, pozvánka a církevní priorita ověřeny.');
