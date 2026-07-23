const isEnglish = document.documentElement.lang === 'en';

const known = {
  '8a9c36a16571439260e87bb58cfc18a508763331f9627f0fd15f71fe751c0d6b': {
    score: '9/9', tone: 'red',
    cs: ['Franz Kafka dnes — retrospektivní důkaz kontinuity', 'Kontinuita příběhu 9/9: listina spojuje legislativní návrhy od roku 2008, petice, řízení 2 T 104/2010, II. ÚS 664/12 a pozvánku státním orgánům z dubna 2025. Procesní význam samotné pozvánky je nižší: nejde o rozhodnutí orgánu ani důkaz pravdivosti všech tvrzení autora. Originál se kvůli údajům dalších osob nezveřejňuje.'],
    en: ['Franz Kafka Today — retrospective evidence of continuity', 'Story continuity 9/9: the record links legislative proposals since 2008, petitions, case 2 T 104/2010, II. ÚS 664/12 and an April 2025 invitation to state authorities. The invitation itself has lower procedural weight: it is neither an authority decision nor proof of every authorial allegation. The original is not published because it contains other people\'s data.']
  },
  '1038a80c8e57a4e4ecd3fb4f511ce9e7a6cf129634f5b193397391f9295966c7': {
    score: '9/9', tone: 'red',
    cs: ['Policejní sdělení z 20. 7. 2026', 'Extrémní vazba na preventivní podání z 12. července. Autor zaslal výzvu policii sám jako důkaz jeho naléhavosti; policie potvrzuje přijetí 14. července a uložení bez dalšího opatření.'],
    en: ['Police communication of 20 July 2026', 'Extreme link to the preventive filing of 12 July. The creator sent the demand to the Police himself as evidence of urgency; the Police confirm receipt on 14 July and filing without further action.']
  },
  '745e82be7dcc991de3e64c22609ae63f0f1bed20892b41ae9a454861cc8cf408': {
    score: '9/9', tone: 'red',
    cs: ['Podnět aliance ve věci 45 T 1/2024', 'Přímá relevance k metodice THC/THCA, nejistotě měření a soudnímu dokazování; nikoli předpověď výsledku.'],
    en: ['Alliance filing in case 45 T 1/2024', 'Direct relevance to THC/THCA methodology, measurement uncertainty and judicial evidence; not an outcome prediction.']
  },
  '394a819a0580869fd220d426a837ba5128c01f5f2d1fb06a17528fa4201fb470': {
    score: '7/9', tone: 'orange', cs: ['Anonymizovaná opravená stížnost G. F. a J. K.', 'Opravená listina uvádí tři společně pěstované rostoucí rostliny a jednu sušící se rostlinu. Procesní přípustnost a účinky podání vyžadují lidskou právní kontrolu.'], en: ['Anonymised corrected complaint by G. F. and J. K.', 'The corrected record states three jointly grown plants and one drying plant. Procedural admissibility and effects require human legal review.']
  },
  'd139801a1c8ff34142d705c9c5d1d8bad4df9c409096f21562ae09a7c314ba20': {
    score: '7/9', tone: 'orange', cs: ['Anonymizovaný dodatek stížnosti G. F. a J. K.', 'Dodatek bere zpět text společné stížnosti ze dne 22. 7. 2026 s výjimkou již zaslaných důkazních příloh a předkládá nové společné podání. Jeho procesní účinky posoudí soud.'], en: ['Anonymised complaint supplement by G. F. and J. K.', 'The supplement withdraws the text of the joint complaint dated 22 July 2026 except for evidence already submitted, and makes a new joint filing. The court will determine its procedural effects.']
  },
  '96b232c921b5c17c9cab604eac0954a8fce57c7327bc0727f5ac80e4bdb39e73': {
    score: '9/9', tone: 'red',
    cs: ['Zásahová žaloba proti Ministerstvu vnitra z 23. 7. 2026', 'Nově podaná žaloba napadá souhrnné vyřízení dvou odlišných stížností sdělením č. j. MV-114818-2/TP-2026. Podání žaloby samo neprokazuje nezákonný zásah; rozhodne Městský soud v Praze.'],
    en: ['Intervention action against the Ministry of the Interior, 23 July 2026', 'The newly filed action challenges the combined handling of two distinct complaints in communication MV-114818-2/TP-2026. Filing the action does not itself prove an unlawful intervention; the Prague Municipal Court will decide.']
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
