const isEnglish = document.documentElement.lang === 'en';

const currentDate = new Date();
const currentDateText = new Intl.DateTimeFormat(isEnglish ? 'en-GB' : 'cs-CZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Prague'
}).format(currentDate).toLocaleUpperCase(isEnglish ? 'en-GB' : 'cs-CZ');
const updatedDateText = new Intl.DateTimeFormat(isEnglish ? 'en-GB' : 'cs-CZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Prague'
}).format(currentDate);

document.querySelectorAll('[data-current-date]').forEach(element => {
  element.textContent = currentDateText;
});
document.querySelectorAll('[data-updated-date]').forEach(element => {
  element.textContent = `${isEnglish ? 'Updated' : 'Aktualizováno'} ${updatedDateText}`;
});

const known = {
  '8a9c36a16571439260e87bb58cfc18a508763331f9627f0fd15f71fe751c0d6b': {
    score: '9/9', tone: 'red',
    cs: ['Franz Kafka dnes — retrospektivní důkaz kontinuity', 'Paměť řadí přesně rozpoznanou listinu k dlouhodobé chronologii příběhu. Jde o autorskou klasifikaci relevance, nikoli potvrzení všech tvrzení obsažených v listině.'],
    en: ['Franz Kafka Today — retrospective evidence of continuity', 'The memory assigns this exactly recognised record to the story’s long chronology. This is an editorial relevance classification, not confirmation of every allegation in the record.']
  },
  '1038a80c8e57a4e4ecd3fb4f511ce9e7a6cf129634f5b193397391f9295966c7': {
    score: '9/9', tone: 'red',
    cs: ['Policejní sdělení z 20. 7. 2026', 'Paměť řadí přesně rozpoznanou listinu k preventivnímu podání z 12. července. Výsledek je vazbou v chronologii, nikoli právním závěrem o postupu policie.'],
    en: ['Police communication of 20 July 2026', 'The memory links this exactly recognised record to the preventive filing of 12 July. The result is a chronological link, not a legal conclusion about police conduct.']
  },
  '745e82be7dcc991de3e64c22609ae63f0f1bed20892b41ae9a454861cc8cf408': {
    score: '9/9', tone: 'red',
    cs: ['Podnět aliance ve věci 45 T 1/2024', 'Paměť řadí přesně rozpoznanou listinu k uzlu metodiky THC/THCA, nejistoty měření a soudního dokazování. Nejde o předpověď výsledku řízení.'],
    en: ['Alliance filing in case 45 T 1/2024', 'The memory assigns this exactly recognised record to the THC/THCA methodology, measurement uncertainty and judicial-evidence node. It does not predict the outcome.']
  },
  '394a819a0580869fd220d426a837ba5128c01f5f2d1fb06a17528fa4201fb470': {
    score: '7/9', tone: 'orange', cs: ['Anonymizovaná opravená stížnost G. F. a J. K.', 'Paměť řadí přesně rozpoznanou veřejnou kopii ke sporu o počet rostlin. Procesní přípustnost, význam tvrzení a účinky podání musí posoudit člověk.'], en: ['Anonymised corrected complaint by G. F. and J. K.', 'The memory assigns this exactly recognised public copy to the plant-count dispute. A human must assess admissibility, the meaning of the allegations and procedural effects.']
  },
  'd139801a1c8ff34142d705c9c5d1d8bad4df9c409096f21562ae09a7c314ba20': {
    score: '7/9', tone: 'orange', cs: ['Anonymizovaný dodatek stížnosti G. F. a J. K.', 'Paměť řadí přesně rozpoznanou veřejnou kopii k pokračování sporu vedeného pod sp. zn. 15 T 11/2025. Procesní účinky podání posoudí soud.'], en: ['Anonymised complaint supplement by G. F. and J. K.', 'The memory assigns this exactly recognised public copy to the continuation of case 15 T 11/2025. The court will determine its procedural effects.']
  },
  '96b232c921b5c17c9cab604eac0954a8fce57c7327bc0727f5ac80e4bdb39e73': {
    score: '9/9', tone: 'red',
    cs: ['Zásahová žaloba proti Ministerstvu vnitra z 23. 7. 2026', 'Paměť řadí přesně rozpoznanou listinu k uzlu soudního přezkumu postupu Ministerstva vnitra. Podání žaloby samo neprokazuje nezákonný zásah; rozhodne soud.'],
    en: ['Intervention action against the Ministry of the Interior, 23 July 2026', 'The memory assigns this exactly recognised record to the judicial-review node concerning the Ministry of the Interior. Filing the action does not itself prove an unlawful intervention; the court will decide.']
  }
};

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

const input = document.querySelector('#evidence-file');
const result = document.querySelector('#analysis-result');

input?.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  result.innerHTML = `<span class="black-dot">…</span><div><b>${isEnglish ? 'Calculating fingerprint' : 'Počítám digitální otisk'}</b><p>${escapeHTML(file.name)}</p></div>`;
  try {
    const fingerprint = await sha256(file);
    const match = known[fingerprint];
    if (!match) {
      result.innerHTML = `<span class="black-dot">…</span><div><b>${isEnglish ? 'Reading the document locally' : 'Čtu dokument místně v prohlížeči'}</b><p>${isEnglish ? 'No exact fingerprint match; I am now checking textual links.' : 'Přesný otisk se neshoduje; nyní kontroluji textové vazby.'}</p></div>`;
      const { analyzeUnknownFile } = await import('./evidence-analyzer.js');
      const analysis = await analyzeUnknownFile(file, isEnglish ? 'en' : 'cs');
      const matchList = analysis.matches.length
        ? `<p><b>${isEnglish ? 'Detected textual signals' : 'Zjištěné textové signály'}:</b> ${analysis.matches.map(escapeHTML).join(', ')}.</p>`
        : '';
      const readingExtent = analysis.pagesRead
        ? `${analysis.pagesRead}/${analysis.pagesTotal} ${isEnglish ? 'pages' : 'stran'}`
        : `${analysis.charactersRead} ${isEnglish ? 'characters' : 'znaků'}`;
      const scoreClass = analysis.score ? `result-score ${analysis.level}` : 'black-dot';
      result.innerHTML = `<span class="${scoreClass}">${analysis.scoreLabel}</span><div><b>${escapeHTML(analysis.title)}</b>${matchList}<p><strong>${isEnglish ? 'Meaning in this matter' : 'Význam relevance v této kauze'}:</strong> ${escapeHTML(analysis.meaning)}</p><p><strong>${isEnglish ? 'Suggested review' : 'Navržená kontrola'}:</strong> ${escapeHTML(analysis.next)}</p><p><strong>${isEnglish ? 'Boundary' : 'Hranice'}:</strong> ${isEnglish ? 'This is a transparent keyword and case-reference match, not a legal conclusion or an outcome prediction.' : 'Jde o průhlednou shodu klíčových slov a spisových značek, nikoli o právní závěr nebo předpověď výsledku.'}</p><small>${isEnglish ? 'Read locally' : 'Místně přečteno'}: ${readingExtent} · SHA-256: ${fingerprint}</small></div>`;
      return;
    }
    const text = isEnglish ? match.en : match.cs;
    result.innerHTML = `<span class="result-score ${match.tone}">${match.score}</span><div><b>${escapeHTML(text[0])}</b><p><strong>${isEnglish ? 'Verified fact' : 'Ověřený fakt'}:</strong> ${isEnglish ? 'The whole-file SHA-256 exactly matches one explicitly supported record.' : 'SHA-256 celého souboru se přesně shoduje s jednou výslovně podporovanou listinou.'}</p><p><strong>${isEnglish ? 'Memory interpretation' : 'Výklad paměti'}:</strong> ${escapeHTML(text[1])}</p><p><strong>${isEnglish ? 'Uncertainty' : 'Nejistota'}:</strong> ${isEnglish ? 'Identity does not verify every allegation in the record or predict any authority’s decision.' : 'Shoda totožnosti nepotvrzuje každé tvrzení listiny ani nepředpovídá rozhodnutí orgánu.'}</p><p><strong>${isEnglish ? 'Next step' : 'Další krok'}:</strong> ${isEnglish ? 'Check the issuer, date, case reference, exact passages and any current deadline before use.' : 'Před použitím ověřte původce, datum, spisovou značku, přesné pasáže a případnou aktuální lhůtu.'}</p><small>${isEnglish ? 'Identity basis' : 'Podklad totožnosti'} — SHA-256: ${fingerprint}</small></div>`;
  } catch (error) {
    console.error('Local evidence analysis failed:', error);
    result.innerHTML = `<span class="black-dot">!</span><div><b>${isEnglish ? 'The browser could not read the file' : 'Prohlížeč soubor nepřečetl'}</b><p>${isEnglish ? 'Nothing was uploaded.' : 'Nic nebylo odesláno.'}</p></div>`;
  }
});
