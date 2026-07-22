const isEnglish = document.documentElement.lang === 'en';

const known = {
  '8a9c36a16571439260e87bb58cfc18a508763331f9627f0fd15f71fe751c0d6b': {
    score: '9/9', tone: 'red',
    cs: ['Franz Kafka dnes — retrospektivní důkaz kontinuity', 'Kontinuita příběhu 9/9: listina spojuje legislativní návrhy od roku 2008, petice, řízení 2 T 104/2010, II. ÚS 664/12 a pozvánku státním orgánům z dubna 2025. Procesní význam samotné pozvánky je nižší: nejde o rozhodnutí orgánu ani důkaz pravdivosti všech tvrzení autora. Originál se kvůli údajům dalších osob nezveřejňuje.'],
    en: ['Franz Kafka Today — retrospective evidence of continuity', 'Story continuity 9/9: the record links legislative proposals since 2008, petitions, case 2 T 104/2010, II. ÚS 664/12 and an April 2025 invitation to state authorities. The invitation itself has lower procedural weight: it is neither an authority decision nor proof of every authorial allegation. The original is not published because it contains other people\'s data.']
  },
  '1038a80c8e57a4e4ecd3fb4f511ce9e7a6cf129634f5b193397391f9295966c7': {
    score: '9/9', tone: 'red',
    cs: ['Policejní sdělení z 20. 7. 2026', 'Extrémní vazba na předžalobní větev NSZ. Listina nepřináší věcnou odpověď ani nevysvětluje cestu podání.'],
    en: ['Police communication of 20 July 2026', 'Extreme link to the pre-action Supreme Public Prosecutor branch. The record gives no merits answer and does not explain the referral path.']
  },
  '745e82be7dcc991de3e64c22609ae63f0f1bed20892b41ae9a454861cc8cf408': {
    score: '9/9', tone: 'red',
    cs: ['Podnět aliance ve věci 45 T 1/2024', 'Přímá relevance k metodice THC/THCA, nejistotě měření a soudnímu dokazování; nikoli předpověď výsledku.'],
    en: ['Alliance filing in case 45 T 1/2024', 'Direct relevance to THC/THCA methodology, measurement uncertainty and judicial evidence; not an outcome prediction.']
  },
  '96661462bc5c4e0149d847319864512db68000a83127223aa94354c08dbe483c': {
    score: '7/9', tone: 'orange', cs: ['Anonymizovaná stížnost G. F. a J. K.', 'Vysoká procesní relevance. Vyžaduje kontrolu přípustnosti, lhůt a oprávněné osoby.'], en: ['Anonymised complaint by G. F. and J. K.', 'High procedural relevance. Admissibility, deadlines and standing require human review.']
  },
  '0f75ba79968a7a3f7e1487c9f9469558aeab419999e9a597da84f3c818035810': {
    score: '7/9', tone: 'orange', cs: ['Anonymizované doplnění stížnosti G. F.', 'Vysoká vazba na stížnost a důkazní chronologii; samo nezaručuje změnu rozhodnutí.'], en: ['Anonymised supplement by G. F.', 'High link to the complaint and evidence chronology; it does not guarantee a changed decision.']
  }
};

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const input = document.querySelector('#evidence-file');
const result = document.querySelector('#analysis-result');

input?.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  result.innerHTML = `<span class="black-dot">…</span><div><b>${isEnglish ? 'Calculating fingerprint' : 'Počítám digitální otisk'}</b><p>${file.name}</p></div>`;
  try {
    const fingerprint = await sha256(file);
    const match = known[fingerprint];
    if (!match) {
      result.innerHTML = `<span class="black-dot">0/0</span><div><b>${isEnglish ? 'No verified match with this case memory' : 'Žádná ověřená shoda s touto pamětí'}</b><p>${isEnglish ? 'The file stayed on your computer. Review its issuer, date, reference, claims, deadlines and possible next step; no prepared conclusion was transferred.' : 'Soubor zůstal ve vašem počítači. Ověřte původce, datum, č. j., výroky, lhůty a možný další krok; žádný připravený závěr nebyl přenesen.'}</p><small>SHA-256: ${fingerprint}</small></div>`;
      return;
    }
    const text = isEnglish ? match.en : match.cs;
    result.innerHTML = `<span class="result-score ${match.tone}">${match.score}</span><div><b>${text[0]}</b><p>${text[1]}</p><small>SHA-256: ${fingerprint}</small></div>`;
  } catch {
    result.innerHTML = `<span class="black-dot">!</span><div><b>${isEnglish ? 'The browser could not read the file' : 'Prohlížeč soubor nepřečetl'}</b><p>${isEnglish ? 'Nothing was uploaded.' : 'Nic nebylo odesláno.'}</p></div>`;
  }
});
