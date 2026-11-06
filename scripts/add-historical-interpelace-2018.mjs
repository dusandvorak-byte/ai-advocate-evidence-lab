import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const supplementPath = 'project-memory/documents-2026-supplement-2026-11-06-interpelace-2018.json';
const source = JSON.parse(await readFile(supplementPath, 'utf8'));
const documents = source.documents || [];
if (documents.length !== 2) throw new Error('Interpelace 2018: přesně dva původní dokumenty');
const [question, answer] = documents;
const root = '/ai-advocate-evidence-lab/';
const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
for (const document of documents) {
  const f = 'web/' + document.public.pdf;
  const bytes = await readFile(f);
  if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Neplatný PDF originál: '+f);
  if (!bytes.subarray(-2048).includes(Buffer.from('%%EOF'))) throw new Error('Chybějící koncový marker PDF: '+f);
  if (bytes.length !== document.public.source_original_size_bytes) throw new Error('Odlišná velikost PDF: '+f);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== document.public.source_original_sha256 || hash !== document.public.sha256) {
    throw new Error('Neodpovídá SHA-256 originálu: '+f);
  }
}
const questionHref = root + question.public.pdf;
const answerHref = root + answer.public.pdf;
const html = (en=false) => {
  const lang = en?'en':'cs';
  const title = en?'Parliamentary question no. 380 (2018) and the Prime Minister’s response':'Parlamentní interpelace č. 380 (2018) a odpověď předsedy vlády';
  const lead = en
    ? 'Two preserved, byte-identical PDF originals document that questions about the handling of the Cannabis is The Cure, z. s. complaint were raised with the government in December 2018. The present 2026 submissions to the Police Presidium and Ministry of Justice raise connected issues in greater forensic and procedural detail.'
    : 'Dva nezměněné PDF originály dokládají, že se otázky vyřízení stížnosti Cannabis is The Cure, z. s., a nečinnosti vlády a resortů dostaly k předsedovi vlády již v prosinci 2018. Současná podání Policejnímu prezidiu a Ministerstvu spravedlnosti na tuto problematiku věcně navazují a podrobněji rozpracovávají forenzní a procesní otázky.';
  const dateNote = en
    ? 'Date discrepancy in the original: the Prime Minister’s reply is headed “11 January 2018”, even though it references a parliamentary question dated 19 December 2018. The enclosed Government Office letter is dated 20 December 2018, and the official conversion certificate 14 January 2019. These dates are reproduced as documented; the actual issue date of the reply is not independently established.'
    : 'Datace originálu: hlavička odpovědi premiéra obsahuje údaj „11. ledna 2018“, ačkoli odkazuje na interpelaci z 19. prosince 2018. Přiložený přípis Úřadu vlády je z 20. prosince 2018 a doložka konverze ze 14. ledna 2019. Originál nebyl opravován; skutečné datum vyhotovení odpovědi z těchto rozporných údajů nelze bezpečně určit.';
  const items=en?[
    ['Written parliamentary question by MP Zuzana Majerová Zahradníková (dated 17 December; parliamentary receipt stamp 19 December 2018)',questionHref,question],
    ['Prime Minister Andrej Babiš’s reply, no. 41872/2018-KPV-2, with Government Office letter and conversion certificate',answerHref,answer]
  ]:[
    ['Písemná interpelace poslankyně Zuzany Majerové Zahradníkové (17. 12. 2018, razítko sněmovny 19. 12. 2018)',questionHref,question],
    ['Odpověď předsedy vlády Andreje Babiše č. j. 41872/2018-KPV-2 s přípisem Úřadu vlády a doložkou konverze',answerHref,answer]
  ];
  const rows = items.map(([label,url,doc])=>'<li><a href="'+esc(url)+'">'+esc(label)+'</a> — '+doc.public.source_original_page_count+' '+(en?'pages':'stran')+', SHA-256: <code>'+doc.public.sha256+'</code></li>').join('');
  const context = en
    ? 'Related 2026 proceedings: Police Presidium PPR-54525/ČJ-2026-990340 and PPR-53675/ČJ-2026-990810; Ministry of Justice MSP-898/2026-OP-OSV. The historical documents are evidence of earlier correspondence, not proof that any criminal allegation was established.'
    : 'Související agenda roku 2026: Policejní prezidium PPR-54525/ČJ-2026-990340 a PPR-53675/ČJ-2026-990810; Ministerstvo spravedlnosti MSP-898/2026-OP-OSV. Historické listiny dokládají existenci dřívější korespondence, nikoliv pravdivost jakéhokoli trestního obvinění.';
  const other=en?'2018-interpelace-380.html':'2018-interpelace-380-en.html';
  const otherLang=en?'Čeština':'English';
  const docsTitle=en?'Original PDF documents':'Původní dokumenty v PDF';
  return '<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="https://dusandvorak-byte.github.io/ai-advocate-evidence-lab/"><title>'+esc(title)+' | Evidence Lab</title><meta name="description" content="'+esc(lead)+'"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body><header><div class="brand"><strong>CannaInsider.EU</strong> · Evidence Lab</div><nav><a href="'+root+'index.html">'+(en?'Home':'Úvod')+'</a> · <a href="'+root+'listiny/'+other+'">'+otherLang+'</a></nav></header><main><article><h1>'+esc(title)+'</h1><p>'+esc(lead)+'</p><h2>'+docsTitle+'</h2><ol>'+rows+'</ol><h2>'+(en?'Contemporaneous evidence and procedural relationship':'Historické souvislosti a procesní vazby')+'</h2><p>'+esc(context)+'</p><p>'+esc(dateNote)+'</p><p>'+(en?'Both PDF files are unchanged, byte-identical copies of the submitted documents.':'Obě PDF jsou původní nezměněné soubory, binárně shodné s dodanými originály.')+'</p></article></main><footer><p>CannaInsider.EU · Evidence Lab · '+(en?'historical documentary archive':'historický dokumentační archiv')+'</p></footer></body></html>\n';
};
await mkdir('web/listiny',{recursive:true});
await writeFile('web/listiny/2018-interpelace-380.html',html(false));
await writeFile('web/listiny/2018-interpelace-380-en.html',html(true));
for (const file of ['web/index.html','web/en.html','web/kc/index.html','web/kc/en.html','web/zpravy/04082026-010.html','web/news/04082026-010.html']) {
  const en = file === 'web/en.html' || file === 'web/kc/en.html' || file.startsWith('web/news/');
  const link = root + 'listiny/' + (en?'2018-interpelace-380-en.html':'2018-interpelace-380.html');
  const label = en?'Parliamentary question no. 380 (2018) and the government response — historical evidence':'Interpelace č. 380 (2018) a odpověď vlády — historický důkaz';
  let current = await readFile(file,'utf8');
  const beforeMark = '<aside id="historicka-interpelace-380">';
  const beforePos = current.indexOf(beforeMark);
  if (beforePos >= 0) {
    const afterPos = current.indexOf('</aside>',beforePos);
    if (afterPos < 0) throw new Error('Unterminated historical evidence panel in '+file);
    current = current.slice(0,beforePos) + current.slice(afterPos+8);
  }
  const panel = '<aside id="historicka-interpelace-380"><h2>'+(en?'Historical evidence: 2018':'Historický důkaz: rok 2018')+'</h2><p><a href="'+link+'">'+label+'</a> · <a href="'+questionHref+'">'+(en?'Question, original PDF':'Interpelace, originál PDF')+'</a> · <a href="'+answerHref+'">'+(en?'Response, original PDF':'Odpověď, originál PDF')+'</a></p></aside>';
  if (!current.includes('</main>')) throw new Error('Missing </main> in '+file);
  current=current.replace('</main>',panel+'</main>');
  await writeFile(file,current,'utf8');
}
console.log('Historical interpellation 380: two byte-identical PDF originals; CZ/EN evidence pages; six entry points.');
