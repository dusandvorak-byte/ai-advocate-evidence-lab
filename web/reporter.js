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

document.querySelectorAll('[data-watch-until]').forEach(element => {
  const until = new Date(element.dataset.watchUntil);
  const remainingDays = Math.ceil((until.getTime() - currentDate.getTime()) / 86_400_000);
  if (!Number.isFinite(remainingDays)) return;

  if (remainingDays < 0) {
    element.textContent = isEnglish
      ? 'Date passed — check the current status'
      : 'Termín uplynul — ověřte aktuální stav';
  } else if (remainingDays === 0) {
    element.textContent = isEnglish ? 'Expected today' : 'Očekáváno dnes';
  } else if (isEnglish) {
    element.textContent = `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} remaining`;
  } else {
    const noun = remainingDays === 1 ? 'den' : remainingDays < 5 ? 'dny' : 'dnů';
    element.textContent = `Zbývá ${remainingDays} ${noun}`;
  }
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
const urlForm = document.querySelector('#evidence-url-form');
const urlInput = document.querySelector('#evidence-url');
let currentPublicationContext = null;

function confidenceLabel(confidence) {
  const labels = {
    high: isEnglish ? 'source fact' : 'fakt ze zdroje',
    medium: isEnglish ? 'tentative interpretation' : 'pracovní výklad',
    low: isEnglish ? 'uncertainty' : 'nejistota',
    recommendation: isEnglish ? 'proposed action' : 'návrh řešení'
  };
  return labels[confidence] || confidence;
}

function renderGroundedGroup(titleCS, titleEN, items) {
  if (!items?.length) return '';
  const list = items.map(item => {
    const page = item.page
      ? `<span>${isEnglish ? 'page' : 'strana'} ${item.page}</span>`
      : '';
    return `<li><p><strong>${escapeHTML(item.claim)}</strong> <span class="evidence-confidence">${escapeHTML(confidenceLabel(item.confidence))}</span></p><blockquote>${escapeHTML(item.citation)}</blockquote>${page}</li>`;
  }).join('');
  return `<section class="evidence-group"><h3>${isEnglish ? titleEN : titleCS}</h3><ol>${list}</ol></section>`;
}

function renderPublicationWorkflow() {
  const taskUrl = 'https://github.com/dusandvorak-byte/ai-advocate-evidence-lab/issues/new?template=document-intake.yml';
  return `
    <section class="publication-workflow" data-publication-workflow>
      <h3>${isEnglish ? 'Controlled path to a public output' : 'Řízená cesta k veřejnému výstupu'}</h3>
      <ol class="workflow-steps">
        <li class="is-complete">${isEnglish ? 'Record received and fingerprinted' : 'Listina přijata a opatřena otiskem'}</li>
        <li class="is-complete">${isEnglish ? 'Quotation-grounded analysis prepared' : 'Připravena citovaná analýza'}</li>
        <li>${isEnglish ? 'Human review and privacy check' : 'Lidská kontrola a ochrana soukromí'}</li>
        <li>${isEnglish ? 'Versioned pull request and publication' : 'Verzovaný pull request a zveřejnění'}</li>
      </ol>
      <fieldset class="review-gate">
        <legend>${isEnglish ? 'Human review gate' : 'Kontrolní brána člověka'}</legend>
        <label><input type="checkbox" data-review-field="quotationsChecked"> ${isEnglish ? 'I compared every displayed quotation with the source.' : 'Porovnal/a jsem každou zobrazenou citaci se zdrojem.'}</label>
        <label><input type="checkbox" data-review-field="privacyAndRightsChecked"> ${isEnglish ? 'I checked anonymisation, privacy and publication rights.' : 'Ověřil/a jsem anonymizaci, soukromí a právo ke zveřejnění.'}</label>
        <label><input type="checkbox" data-review-field="legalReviewChecked"> ${isEnglish ? 'A human reviewed the classification, uncertainty and proposed next steps.' : 'Člověk zkontroloval zařazení, nejistoty a navržené další kroky.'}</label>
      </fieldset>
      <p class="workflow-status" data-workflow-status>${isEnglish ? 'Status: human review required.' : 'Stav: nutná lidská kontrola.'}</p>
      <div class="workflow-actions">
        <button type="button" data-download-draft>${isEnglish ? 'Download review packet' : 'Stáhnout pracovní balík'}</button>
        <button type="button" data-download-candidate disabled>${isEnglish ? 'Download publication candidate' : 'Stáhnout kandidáta publikace'}</button>
        <a href="${taskUrl}" target="_blank" rel="noopener noreferrer">${isEnglish ? 'Open a GitHub editorial task' : 'Otevřít redakční úkol na GitHubu'}</a>
      </div>
      <p class="workflow-boundary">${isEnglish
        ? 'The GitHub repository and its issues are public. Do not attach an unreviewed record or a private link. Downloading a candidate does not publish it; a reviewed pull request and passing tests remain required.'
        : 'Repozitář i issues na GitHubu jsou veřejné. Nepřikládejte nezkontrolovanou listinu ani neveřejný odkaz. Stažení kandidáta jej nezveřejní; nadále je nutný zkontrolovaný pull request a úspěšné testy.'}</p>
    </section>`;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function reviewState(container) {
  return Object.fromEntries(
    [...container.querySelectorAll('[data-review-field]')]
      .map(field => [field.dataset.reviewField, field.checked])
  );
}

function packetFilename(context, extension) {
  const stem = String(context.file.name || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'document';
  return `${stem}-publication-candidate.${extension}`;
}

function bindPublicationWorkflow() {
  const container = result.querySelector('[data-publication-workflow]');
  if (!container || !currentPublicationContext) return;
  const status = container.querySelector('[data-workflow-status]');
  const candidateButton = container.querySelector('[data-download-candidate]');
  const draftButton = container.querySelector('[data-download-draft]');

  const buildPacket = review => currentPublicationContext.buildPublicationPacket({
    analysis: currentPublicationContext.analysis,
    fingerprint: currentPublicationContext.fingerprint,
    fileName: currentPublicationContext.file.name,
    sourceUrl: currentPublicationContext.sourceMeta.sourceUrl,
    sourceLabel: currentPublicationContext.sourceMeta.sourceLabel,
    language: isEnglish ? 'en' : 'cs',
    exactSupportedIdentity: Boolean(currentPublicationContext.match),
    supportedIdentityLabel: currentPublicationContext.match
      ? (isEnglish ? currentPublicationContext.match.en : currentPublicationContext.match.cs)[0]
      : null,
    review
  });

  const refresh = () => {
    const packet = buildPacket(reviewState(container));
    candidateButton.disabled = packet.status !== 'publication-candidate';
    status.textContent = packet.status === 'publication-candidate'
      ? (isEnglish
          ? 'Status: publication candidate. Repository review and tests are still required.'
          : 'Stav: kandidát publikace. Stále je nutná kontrola repozitáře a testy.')
      : (isEnglish ? 'Status: human review required.' : 'Stav: nutná lidská kontrola.');
  };

  container.querySelectorAll('[data-review-field]').forEach(field => {
    field.addEventListener('change', refresh);
  });
  draftButton.addEventListener('click', () => {
    const packet = buildPacket(reviewState(container));
    downloadText(
      packetFilename(currentPublicationContext, 'json'),
      `${JSON.stringify(packet, null, 2)}\n`,
      'application/json'
    );
  });
  candidateButton.addEventListener('click', () => {
    const packet = buildPacket(reviewState(container));
    if (packet.status !== 'publication-candidate') return;
    downloadText(
      packetFilename(currentPublicationContext, 'md'),
      `${currentPublicationContext.buildPublicationMarkdown(packet)}\n`,
      'text/markdown'
    );
  });
  refresh();
}

function renderAnalysis(file, fingerprint, analysis, match, sourceMeta = {}, analyzerModule = {}) {
  const readingExtent = analysis.pagesRead
    ? `${analysis.pagesRead}/${analysis.pagesTotal} ${isEnglish ? 'pages' : 'stran'}`
    : `${analysis.charactersRead} ${isEnglish ? 'characters' : 'znaků'}`;
  const sourceLabel = sourceMeta.sourceLabel
    ? `<span>${isEnglish ? 'External source' : 'Externí zdroj'}: ${escapeHTML(sourceMeta.sourceLabel)}</span>`
    : `<span>${isEnglish ? 'Selected file' : 'Vybraný soubor'}: ${escapeHTML(file.name)}</span>`;

  if (analysis.score === null) {
    currentPublicationContext = null;
    result.innerHTML = `<span class="black-dot">—</span><div class="analysis-body"><b>${escapeHTML(analysis.title)}</b><p>${escapeHTML(analysis.meaning)}</p><p><strong>${isEnglish ? 'Proposed action' : 'Návrh řešení'}:</strong> ${escapeHTML(analysis.next)}</p><div class="analysis-meta">${sourceLabel}<span>${isEnglish ? 'Read locally' : 'Místně přečteno'}: ${readingExtent}</span><span>SHA-256: ${fingerprint}</span></div></div>`;
    return;
  }

  const identity = match
    ? `<p class="identity-status"><strong>${isEnglish ? 'Exact supported identity' : 'Přesně podporovaná totožnost'}:</strong> ${escapeHTML((isEnglish ? match.en : match.cs)[0])}. ${isEnglish ? 'The whole-file SHA-256 matches one supported record; this does not verify every statement in it.' : 'SHA-256 celého souboru se shoduje s jednou podporovanou listinou; tím se nepotvrzuje každé její tvrzení.'}</p>`
    : `<p class="identity-status"><strong>${isEnglish ? 'Identity' : 'Totožnost'}:</strong> ${isEnglish ? 'No exact supported fingerprint match. The following output is a tentative, quotation-grounded reading.' : 'Nebyla nalezena přesná shoda s podporovaným otiskem. Následuje pracovní čtení opřené o citované pasáže.'}</p>`;
  const matchList = analysis.matches.length
    ? `<p><strong>${isEnglish ? 'Detected textual signals' : 'Zjištěné textové signály'}:</strong> ${analysis.matches.map(escapeHTML).join(', ')}.</p>`
    : '';
  const score = match?.score || analysis.scoreLabel;
  const tone = match?.tone || analysis.level;

  result.innerHTML = `
    <span class="result-score ${escapeHTML(tone)}">${escapeHTML(score)}</span>
    <div class="analysis-body">
      <b>${escapeHTML(analysis.title)}</b>
      ${identity}
      ${matchList}
      ${renderGroundedGroup('Doložená fakta', 'Source-grounded facts', analysis.facts)}
      ${renderGroundedGroup('Pracovní zařazení a výklad', 'Tentative classification and interpretation', analysis.interpretations)}
      ${renderGroundedGroup('Nejistoty a hranice', 'Uncertainty and boundaries', analysis.uncertainties)}
      ${renderGroundedGroup('Návrhy řešení a dalších kontrol', 'Proposed solutions and checks', analysis.recommendations)}
      <p class="human-review"><strong>${isEnglish ? 'Human review required:' : 'Nutná lidská kontrola:'}</strong> ${isEnglish ? 'The prototype does not provide legal advice, decide guilt, or predict an authority’s outcome.' : 'Prototyp neposkytuje právní radu, nerozhoduje o vině a nepředpovídá výsledek řízení.'}</p>
      <div class="analysis-meta">${sourceLabel}<span>${isEnglish ? 'Read locally' : 'Místně přečteno'}: ${readingExtent}</span><span>SHA-256: ${fingerprint}</span></div>
      ${renderPublicationWorkflow()}
    </div>`;
  currentPublicationContext = {
    file,
    fingerprint,
    analysis,
    match,
    sourceMeta,
    buildPublicationPacket: analyzerModule.buildPublicationPacket,
    buildPublicationMarkdown: analyzerModule.buildPublicationMarkdown
  };
  bindPublicationWorkflow();
}

function renderError(error, sourceType = 'file') {
  currentPublicationContext = null;
  const code = error?.message || '';
  const messages = {
    'invalid-url': ['Odkaz není platná webová adresa.', 'The link is not a valid web address.'],
    'https-required': ['Použijte přímý odkaz začínající https://.', 'Use a direct link beginning with https://.'],
    'credentials-not-allowed': ['Odkaz nesmí obsahovat uživatelské jméno ani heslo.', 'The link must not contain a username or password.'],
    'private-host-not-allowed': ['Místní a neveřejné síťové adresy nelze načítat.', 'Local and private network addresses cannot be fetched.'],
    'pdf-too-large': ['PDF překračuje bezpečnostní limit 30 MB.', 'The PDF exceeds the 30 MB safety limit.'],
    'not-a-pdf': ['Stažený obsah není platné PDF.', 'The downloaded content is not a valid PDF.'],
    'download-timeout': ['Stažení se nepodařilo dokončit včas.', 'The download did not finish in time.'],
    'download-blocked': ['Zdroj stažení v prohlížeči zablokoval. Uložte PDF a vložte je tlačítkem.', 'The source blocked browser download. Save the PDF and select it with the file button.']
  };
  const fallback = sourceType === 'url'
    ? ['Externí PDF se nepodařilo bezpečně načíst. Zdroj musí povolit stažení z jiného webu (CORS).', 'The external PDF could not be loaded safely. The source must permit cross-site browser download (CORS).']
    : ['Prohlížeč soubor nepřečetl.', 'The browser could not read the file.'];
  const message = messages[code] || fallback;
  result.innerHTML = `<span class="black-dot">!</span><div class="analysis-body"><b>${escapeHTML(isEnglish ? message[1] : message[0])}</b><p>${isEnglish ? 'No document was sent to CannaInsider.' : 'Do CannaInsideru nebyl odeslán žádný dokument.'}</p></div>`;
}

function renderKnownIdentityFallback(file, fingerprint, match, sourceMeta = {}) {
  currentPublicationContext = null;
  const title = (isEnglish ? match.en : match.cs)[0];
  const sourceLabel = sourceMeta.sourceLabel || file.name;
  result.innerHTML = `<span class="result-score ${escapeHTML(match.tone)}">${escapeHTML(match.score)}</span><div class="analysis-body"><b>${escapeHTML(title)}</b><p class="identity-status"><strong>${isEnglish ? 'Technical identity confirmed' : 'Technická totožnost potvrzena'}:</strong> ${isEnglish ? 'The whole-file SHA-256 matches a supported record.' : 'SHA-256 celého souboru se shoduje s podporovanou listinou.'}</p><p><strong>${isEnglish ? 'Content boundary' : 'Hranice obsahu'}:</strong> ${isEnglish ? 'The text layer could not be read, so no prepared interpretation or proposed solution is displayed without source quotations.' : 'Textovou vrstvu se nepodařilo přečíst, proto se bez citací ze zdroje nezobrazuje připravený výklad ani návrh řešení.'}</p><div class="analysis-meta"><span>${escapeHTML(sourceLabel)}</span><span>SHA-256: ${fingerprint}</span></div></div>`;
}

async function processEvidenceFile(file, sourceMeta = {}) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) {
    renderError(new Error('pdf-too-large'), sourceMeta.sourceLabel ? 'url' : 'file');
    return;
  }
  result.innerHTML = `<span class="black-dot">…</span><div><b>${isEnglish ? 'Calculating fingerprint' : 'Počítám digitální otisk'}</b><p>${escapeHTML(file.name)}</p></div>`;
  let fingerprint;
  let match;
  try {
    const loaded = await Promise.all([
      import('./evidence-analyzer.js'),
      sha256(file)
    ]);
    const { analyzeUnknownFile } = loaded[0];
    fingerprint = loaded[1];
    match = known[fingerprint];
    result.innerHTML = `<span class="black-dot">…</span><div><b>${isEnglish ? 'Reading and classifying locally' : 'Místně čtu a zařazuji listinu'}</b><p>${isEnglish ? 'Every displayed conclusion will carry a source quotation.' : 'Každý zobrazený závěr dostane citaci ze zdroje.'}</p></div>`;
    const analysis = await analyzeUnknownFile(file, isEnglish ? 'en' : 'cs');
    renderAnalysis(file, fingerprint, analysis, match, sourceMeta, loaded[0]);
  } catch (error) {
    console.error('Local evidence analysis failed:', error);
    if (match && fingerprint) {
      renderKnownIdentityFallback(file, fingerprint, match, sourceMeta);
      return;
    }
    renderError(error, sourceMeta.sourceLabel ? 'url' : 'file');
  }
}

input?.addEventListener('change', async () => {
  await processEvidenceFile(input.files?.[0]);
});

urlForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const rawUrl = urlInput?.value;
  if (!rawUrl) return;
  result.innerHTML = `<span class="black-dot">↓</span><div><b>${isEnglish ? 'Loading the external PDF' : 'Načítám externí PDF'}</b><p>${isEnglish ? 'The source server is contacted directly by your browser.' : 'Se zdrojovým serverem se spojuje přímo váš prohlížeč.'}</p></div>`;
  try {
    const { fetchExternalPdf } = await import('./evidence-analyzer.js');
    const remote = await fetchExternalPdf(rawUrl);
    await processEvidenceFile(remote.file, {
      sourceLabel: remote.sourceLabel,
      sourceUrl: remote.sourceUrl
    });
  } catch (error) {
    console.error('External evidence download failed:', error);
    renderError(error, 'url');
  }
});
