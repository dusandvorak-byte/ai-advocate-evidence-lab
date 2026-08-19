import { readFile, writeFile } from 'node:fs/promises';

const czechTitle = 'Ministerstvo dopravy odložilo žádost o informace k odběru, přepravě a úschově krevních vzorků; uvedlo, že takovými dokumenty nedisponuje a nikdy nedisponovalo';
const englishTitle = 'The Ministry of Transport deferred the information request on blood-sample collection, transport and storage, stating that it holds no such documents and has never held any';

for (const path of ['web/en.html', 'web/kc/en.html']) {
  let html = await readFile(path, 'utf8');
  html = html.replaceAll(czechTitle, englishTitle);
  html = html.replaceAll('>Ministerstvo dopravy<', '>Ministry of Transport<');
  await writeFile(path, html, 'utf8');
}

console.log('Ministry of Transport latest-record cards localized on English public surfaces.');
