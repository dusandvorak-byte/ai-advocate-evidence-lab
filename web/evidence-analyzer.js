const MEMORY_SIGNALS = [
  { label: '15 T 11/2025', weight: 5, pattern: /\b15\s*T\s*11\s*[\/-]\s*2025\b/i, nodeCS: 'OS v Ostravě — větev 15 T 11/2025', nodeEN: 'Ostrava District Court — 15 T 11/2025 branch' },
  { label: '45 T 1/2024', weight: 5, pattern: /\b45\s*T\s*1\s*[\/-]\s*2024\b/i, nodeCS: 'soudní dokazování — větev 45 T 1/2024', nodeEN: 'judicial evidence — 45 T 1/2024 branch' },
  { label: '2 T 104/2010', weight: 5, pattern: /\b2\s*T\s*104\s*[\/-]\s*2010\b/i, nodeCS: 'historická trestní větev 2 T 104/2010', nodeEN: 'historical criminal branch 2 T 104/2010' },
  { label: '18 A 17/2026', weight: 5, pattern: /\b18\s*A\s*17\s*[\/-]\s*2026\b/i, nodeCS: 'správní soud — větev 18 A 17/2026', nodeEN: 'administrative court — 18 A 17/2026 branch' },
  { label: '18 A 23/2026', weight: 5, pattern: /\b18\s*A\s*23\s*[\/-]\s*2026\b/i, nodeCS: 'správní soud — větev 18 A 23/2026', nodeEN: 'administrative court — 18 A 23/2026 branch' },
  { label: '8 Ad 9/2026', weight: 5, pattern: /\b8\s*Ad\s*9\s*[\/-]\s*2026\b/i, nodeCS: 'správní soud — větev 8 Ad 9/2026', nodeEN: 'administrative court — 8 Ad 9/2026 branch' },
  { label: '1 KZT 475/2026', weight: 5, pattern: /\b1\s*KZT\s*475\s*[\/-]\s*2026\b/i, nodeCS: 'KSZ v Brně — přezkumná větev 1 KZT 475/2026', nodeEN: 'Brno Regional Public Prosecutor — review branch 1 KZT 475/2026' },
  { label: '2 KZN 55/2026', weight: 5, pattern: /\b2\s*KZN\s*55\s*[\/-]\s*2026\b/i, nodeCS: 'MSZ v Praze — větev 2 KZN 55/2026', nodeEN: 'Prague Municipal Public Prosecutor — branch 2 KZN 55/2026' },
  { label: '6 NZN 1737/2026', weight: 5, pattern: /\b6\s*NZN\s*1737\s*[\/-]\s*2026\b/i, nodeCS: 'NSZ — dohledová větev 6 NZN 1737/2026', nodeEN: 'Supreme Public Prosecutor — supervision branch 6 NZN 1737/2026' },
  { label: '3 KZN 197/2026', weight: 5, pattern: /\b3\s*KZN\s*197\s*[\/-]\s*2026\b/i, nodeCS: 'MSZ v Praze — větev 3 KZN 197/2026', nodeEN: 'Prague Municipal Public Prosecutor — branch 3 KZN 197/2026' },
  { label: '1 VZN 1678/2026', weight: 5, pattern: /\b1\s*VZN\s*1678\s*[\/-]\s*2026\b/i, nodeCS: 'VSZ v Praze — dohledová větev 1 VZN 1678/2026', nodeEN: 'Prague High Public Prosecutor — supervision branch 1 VZN 1678/2026' },
  { label: '3 VZN 239/2026', weight: 5, pattern: /\b3\s*VZN\s*239\s*[\/-]\s*2026\b/i, nodeCS: 'VSZ v Olomouci — dohledová větev 3 VZN 239/2026', nodeEN: 'Olomouc High Public Prosecutor — supervision branch 3 VZN 239/2026' },
  { label: '1 ZN 320/2026', weight: 5, pattern: /\b1\s*ZN\s*320\s*[\/-]\s*2026\b/i, nodeCS: 'OSZ pro Prahu 4 — větev 1 ZN 320/2026', nodeEN: 'Prague 4 District Public Prosecutor — branch 1 ZN 320/2026' },
  { label: '1 ZT 11/2010', weight: 5, pattern: /\b1\s*ZT\s*11\s*[\/-]\s*2010\b/i, nodeCS: 'OSZ v Prostějově — historická větev 1 ZT 11/2010', nodeEN: 'Prostějov District Public Prosecutor — historical branch 1 ZT 11/2010' },
  { label: '4 KZN 7116/2026', weight: 5, pattern: /\b4\s*KZN\s*7116\s*[\/-]\s*2026\b/i, nodeCS: 'KSZ v Ostravě — větev 4 KZN 7116/2026', nodeEN: 'Ostrava Regional Public Prosecutor — branch 4 KZN 7116/2026' },
  { label: 'KRPM-100092', weight: 5, pattern: /KRPM[\s-]*100092/i, nodeCS: 'Policie ČR — preventivní větev KRPM-100092', nodeEN: 'Czech Police — preventive branch KRPM-100092' },
  { label: 'MV-114818-2/TP-2026', weight: 5, pattern: /MV[\s-]*114818[\s-]*2\s*[\/-]\s*TP[\s-]*2026/i, nodeCS: 'Ministerstvo vnitra — větev MV-114818-2/TP-2026', nodeEN: 'Ministry of the Interior — branch MV-114818-2/TP-2026' },
  { label: 'MK 45728/2026 SOCNS', weight: 5, pattern: /MK\s*45728\s*[\/-]\s*2026\s*SOCNS/i, nodeCS: 'Ministerstvo kultury — větev MK 45728/2026 SOCNS', nodeEN: 'Ministry of Culture — branch MK 45728/2026 SOCNS' },
  { label: 'Cannabis is The Cure', weight: 4, pattern: /Cannabis\s+is\s+The\s+Cure/i },
  { label: 'Konopí je lék', weight: 4, pattern: /Konop[ií]\s+je\s+l[eé]k/i },
  { label: 'Konopná církev', weight: 4, pattern: /Konopn(?:a|á|e|é)\s+c[ií]rkv(?:e|i|í)/i },
  { label: 'Edukativní konopná klinika', weight: 4, pattern: /Edukativn[ií]\s+konopn[aá]\s+klinika/i },
  { label: 'Dušan Dvořák', weight: 4, pattern: /Du[sš]an\s+Dvo[rř][aá]k/i },
  { label: 'Nejvyšší státní zastupitelství', weight: 3, pattern: /Nejvy[sš][sš][ií](mu)?\s+st[aá]tn[ií](mu)?\s+zastupitelstv[ií]/i }
];

const TOPIC_SIGNALS = [
  {
    label: 'konopí / cannabis / THC',
    weight: 2,
    pattern: /\b(konop\w*|cannabis|marihuan\w*|THC|THCA|tetrahydrokanabinol\w*)\b/i
  },
  {
    label: 'měření nebo laboratorní důkaz',
    weight: 2,
    pattern: /\b(m[eě][rř]en[ií]|laborato[rř]\w*|vzork\w*|nejistot\w*|chromatograf\w*|dekarboxyl\w*|OKTE)\b/i
  },
  {
    label: 'soudní nebo správní řízení',
    weight: 1,
    pattern: /\b(soud\w*|[zž]alob\w*|st[ií][zž]nost\w*|trestn[ií]\w*|obvin[eě]n\w*|odsouzen\w*|ministerstv\w*|polici\w*|st[aá]tn[ií]\s+zastupitelstv\w*|sp\.\s*zn\.|[cč]\.\s*j\.)\b/i
  },
  {
    label: 'obnova nebo náprava řízení',
    weight: 2,
    pattern: /\b(obnov\w+\s+[rř][ií]zen[ií]|poru[sš]en[ií]\s+z[aá]kona|nez[aá]konn\w+\s+z[aá]sah\w*|n[aá]hrad\w+\s+([sš]kody|[uú]jmy)|opr[aá]vn[yý]\s+prost[rř]edek)\b/i
  }
];

const INSTITUTION_SIGNALS = [
  { cs: 'Nejvyšší státní zastupitelství', en: 'Supreme Public Prosecutor', pattern: /Nejvy[sš][sš][ií]\s+st[aá]tn[ií]\s+zastupitelstv[ií]|\bNSZ\b/i },
  { cs: 'Vrchní státní zastupitelství', en: 'High Public Prosecutor', pattern: /Vrchn[ií]\s+st[aá]tn[ií]\s+zastupitelstv[ií]|\bVSZ\b/i },
  { cs: 'Městské státní zastupitelství v Praze', en: 'Prague Municipal Public Prosecutor', pattern: /M[eě]stsk[eé]\s+st[aá]tn[ií]\s+zastupitelstv[ií]\s+v\s+Praze|\bMSZ\s+v\s+Praze\b/i },
  { cs: 'Krajské státní zastupitelství v Brně', en: 'Brno Regional Public Prosecutor', pattern: /Krajsk[eé]\s+st[aá]tn[ií]\s+zastupitelstv[ií]\s+v\s+Brn[eě]|\bKSZ\s+v\s+Brn[eě]\b/i },
  { cs: 'Policie České republiky', en: 'Police of the Czech Republic', pattern: /Polici(?:e|i)\s+[ČC]esk[eé]\s+republiky|\bPolicie\s+[ČC]R\b|\bKŘP\b/i },
  { cs: 'Ministerstvo vnitra', en: 'Ministry of the Interior', pattern: /Ministerstv(?:o|u)\s+vnitra/i },
  { cs: 'Ministerstvo spravedlnosti', en: 'Ministry of Justice', pattern: /Ministerstv(?:o|u)\s+spravedlnosti/i },
  { cs: 'Ministerstvo kultury', en: 'Ministry of Culture', pattern: /Ministerstv(?:o|u)\s+kultury/i },
  { cs: 'soud', en: 'court', pattern: /\b(?:okresn[ií]|krajsk[ií]|m[eě]stsk[ií]|vrchn[ií]|[uú]stavn[ií]|nejvy[sš][sš][ií])\s+soud\b/i }
];

const DOCUMENT_KIND_SIGNALS = [
  {
    id: 'referral',
    cs: 'procesní postoupení nebo předání',
    en: 'procedural referral or forwarding',
    pattern: /\b(postoupen\w*|p[řr]ed[aá]n\w+\s+(?:jin[eé]mu|k|na)|p[řr]epos[lľ]a\w*)\b/i
  },
  {
    id: 'decision',
    cs: 'rozhodnutí nebo usnesení',
    en: 'decision or order',
    pattern: /\b(rozhodl\w*|usnesen[ií]|rozsudek|zam[ií]t\w*|odm[ií]t\w*)\b/i
  },
  {
    id: 'notice',
    cs: 'úřední sdělení nebo vyrozumění',
    en: 'official notice or communication',
    pattern: /\b(vyrozum[eě]n[ií]|sd[eě]luj\w*|oznamuj\w*|informuj\w*)\b/i
  },
  {
    id: 'filing',
    cs: 'podání, žádost, stížnost nebo žaloba',
    en: 'filing, request, complaint or action',
    pattern: /\b(pod[aá]n[ií]|podn[eě]t|[zž][aá]dost|st[ií][zž]nost|[zž]alob\w*|v[yý]zv\w*)\b/i
  },
  {
    id: 'expert',
    cs: 'odborný nebo laboratorní podklad',
    en: 'expert or laboratory material',
    pattern: /\b(znaleck\w*|odborn[eé]\s+vyj[aá]d[řr]en[ií]|laborato[řr]\w*|chromatograf\w*|nejistot\w+\s+m[eě][řr]en[ií])\b/i
  }
];

const GENERIC_CASE_REFERENCE = /\b(?:sp\.\s*zn\.\s*|[čc]\.\s*j\.\s*)?((?:\d+\s*)?[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{1,6}\s*\d+(?:\s*[/-]\s*\d{2,4})(?:\s*-\s*\d+)?)\b/g;
const DATE_REFERENCE = /\b\d{1,2}\.\s*(?:\d{1,2}\.|ledna|[uú]nora|b[řr]ezna|dubna|kv[eě]tna|[čc]ervna|[čc]ervence|srpna|z[aá][řr][ií]|[řr][ií]jna|listopadu|prosince)\s*\d{4}\b/gi;
const EXPLICIT_DEADLINE = /\b(?:nejpozd[eě]ji\s+)?do\s+\d{1,2}\.\s*(?:\d{1,2}\.|ledna|[uú]nora|b[řr]ezna|dubna|kv[eě]tna|[čc]ervna|[čc]ervence|srpna|z[aá][řr][ií]|[řr][ií]jna|listopadu|prosince)\s*\d{4}\b/i;

export const MAX_EXTERNAL_PDF_BYTES = 30 * 1024 * 1024;

function cap(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function scoreEvidenceText(text, language = 'cs') {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  const directMatches = MEMORY_SIGNALS.filter(signal => signal.pattern.test(cleanText));
  const topicMatches = TOPIC_SIGNALS.filter(signal => signal.pattern.test(cleanText));
  const hasCannabisTopic = topicMatches.some(signal => signal.label === 'konopí / cannabis / THC');
  const hasLegalTopic = topicMatches.some(signal => signal.label === 'soudní nebo správní řízení');

  let score = 0;
  if (directMatches.length) {
    score = directMatches.reduce((total, signal) => total + signal.weight, 0);
    score += topicMatches.reduce((total, signal) => total + signal.weight, 0);
  } else if (hasCannabisTopic && hasLegalTopic) {
    score = topicMatches.reduce((total, signal) => total + signal.weight, 0);
  } else if (hasCannabisTopic || hasLegalTopic) {
    score = 1;
  }
  score = cap(score, 0, 9);

  const matches = [...directMatches, ...topicMatches].map(signal => signal.label);
  const level = score >= 9 ? 'red' : score >= 7 ? 'orange' : score >= 3 ? 'yellow' : score > 0 ? 'green' : 'black';
  const cs = {
    title: score ? 'Orientační shoda s veřejnou důkazní pamětí' : 'Žádná zjistitelná textová shoda s veřejnou pamětí',
    next: directMatches.length
      ? 'Zkontrolujte shodnou spisovou značku, původce, datum, citované výroky a procesní lhůtu.'
      : 'Ověřte původce, datum, spisovou značku, přesné výroky a možný další procesní krok.'
  };
  const en = {
    title: score ? 'Indicative match with the public evidence memory' : 'No detectable textual match with the public memory',
    next: directMatches.length
      ? 'Check the matching case reference, issuer, date, quoted statements and procedural deadline.'
      : 'Check the issuer, date, case reference, exact statements and possible next procedural step.'
  };
  const meaningCS = score >= 9
    ? 'Text obsahuje rozpoznanou spisovou značku, instituci nebo důkazní uzel této paměti; jde o důvod k přednostní lidské kontrole, ne o ověřenou procesní vazbu.'
    : score >= 7
      ? 'Text obsahuje několik silných signálů společných s touto pamětí; před použitím je nutné ověřit skutečný procesní vztah.'
      : score >= 3
        ? 'Listina se týká stejného právního nebo důkazního problému, ale přímé spojení s konkrétním řízením zatím není doloženo.'
        : score > 0
          ? 'Listina má pouze obecnou tematickou souvislost a sama nerozšiřuje důkazní řetězec této kauzy.'
          : 'Text neobsahuje rozpoznanou vazbu na zveřejněnou paměť této kauzy; dokument přesto může mít význam v jiné věci.';
  const meaningEN = score >= 9
    ? 'The text contains a recognised case reference, institution or evidence node from this memory; this calls for priority human review, not a verified procedural link.'
    : score >= 7
      ? 'The text contains several strong signals shared with this memory, but the actual procedural relationship must be verified.'
      : score >= 3
        ? 'The record concerns the same legal or evidentiary problem, but no direct link to a specific proceeding is established yet.'
        : score > 0
          ? 'The record has only a general thematic connection and does not by itself extend this matter’s evidence chain.'
          : 'No recognised link to this matter’s published memory was found; the record may still matter in another case.';

  return {
    score,
    scoreLabel: score ? `${score}/9` : '0/0',
    level,
    matches,
    title: (language === 'en' ? en : cs).title,
    next: (language === 'en' ? en : cs).next,
    meaning: language === 'en' ? meaningEN : meaningCS,
    verifiedIdentity: false,
    legalConclusion: false
  };
}

function normalizeSourceText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function asSourcePages(source) {
  if (Array.isArray(source)) {
    return source
      .map((page, index) => ({
        pageNumber: Number.isInteger(page?.pageNumber) ? page.pageNumber : index + 1,
        text: normalizeSourceText(page?.text)
      }))
      .filter(page => page.text);
  }
  const text = normalizeSourceText(source);
  return text ? [{ pageNumber: null, text }] : [];
}

function quoteAround(pageText, index, matchLength, maximum = 280) {
  const half = Math.floor((maximum - matchLength) / 2);
  let start = Math.max(0, index - half);
  let end = Math.min(pageText.length, index + matchLength + half);
  const leftBoundary = pageText.lastIndexOf('. ', index);
  const rightBoundary = pageText.indexOf('. ', index + matchLength);

  if (leftBoundary >= start) start = leftBoundary + 2;
  if (rightBoundary > -1 && rightBoundary + 1 <= end) end = rightBoundary + 1;

  return pageText.slice(start, end).trim();
}

function quoteForPattern(pages, pattern) {
  for (const page of pages) {
    const flags = pattern.flags.replace('g', '');
    const match = new RegExp(pattern.source, flags).exec(page.text);
    if (match) {
      return {
        citation: quoteAround(page.text, match.index, match[0].length),
        page: page.pageNumber
      };
    }
  }
  return null;
}

function fallbackQuote(pages) {
  const page = pages.find(candidate => candidate.text);
  if (!page) return null;
  return {
    citation: page.text.slice(0, 280).trim(),
    page: page.pageNumber
  };
}

function groundedItem(claim, quote, confidence) {
  if (!quote?.citation) return null;
  return {
    claim,
    citation: quote.citation,
    confidence,
    page: quote.page
  };
}

function uniqueGrounded(items) {
  const seen = new Set();
  return items.filter(Boolean).filter(item => {
    const key = `${item.claim}\n${item.citation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectGenericCaseReferences(pages) {
  const references = [];
  for (const page of pages) {
    const pattern = new RegExp(GENERIC_CASE_REFERENCE.source, GENERIC_CASE_REFERENCE.flags);
    for (const match of page.text.matchAll(pattern)) {
      const value = normalizeSourceText(match[1]);
      if (!value || references.some(reference => reference.value === value)) continue;
      references.push({
        value,
        quote: {
          citation: quoteAround(page.text, match.index, match[0].length),
          page: page.pageNumber
        }
      });
      if (references.length >= 12) return references;
    }
  }
  return references;
}

function collectDateReferences(pages) {
  const dates = [];
  for (const page of pages) {
    const pattern = new RegExp(DATE_REFERENCE.source, DATE_REFERENCE.flags);
    for (const match of page.text.matchAll(pattern)) {
      const value = normalizeSourceText(match[0]);
      if (dates.some(date => date.value === value)) continue;
      dates.push({
        value,
        quote: {
          citation: quoteAround(page.text, match.index, match[0].length),
          page: page.pageNumber
        }
      });
      if (dates.length >= 8) return dates;
    }
  }
  return dates;
}

export function buildEvidenceReport(source, language = 'cs') {
  const pages = asSourcePages(source);
  const sourceText = pages.map(page => page.text).join('\n');
  if (!sourceText) {
    return {
      sourceText: '',
      facts: [],
      interpretations: [],
      uncertainties: [],
      recommendations: [],
      placements: [],
      documentKind: null
    };
  }

  const isEnglish = language === 'en';
  const firstQuote = fallbackQuote(pages);
  const caseReferences = collectGenericCaseReferences(pages);
  const dateReferences = collectDateReferences(pages);
  const institutions = INSTITUTION_SIGNALS
    .map(signal => ({ ...signal, quote: quoteForPattern(pages, signal.pattern) }))
    .filter(signal => signal.quote);
  const kinds = DOCUMENT_KIND_SIGNALS
    .map(signal => ({ ...signal, quote: quoteForPattern(pages, signal.pattern) }))
    .filter(signal => signal.quote);
  const documentKind = kinds[0] || null;
  const placements = MEMORY_SIGNALS
    .map(signal => ({ ...signal, quote: quoteForPattern(pages, signal.pattern) }))
    .filter(signal => signal.quote && signal.nodeCS && signal.nodeEN)
    .map(signal => ({
      label: isEnglish ? signal.nodeEN : signal.nodeCS,
      signal: signal.label,
      status: 'tentative',
      citation: signal.quote.citation,
      page: signal.quote.page
    }));

  const facts = [];
  for (const reference of caseReferences.slice(0, 6)) {
    facts.push(groundedItem(
      isEnglish
        ? `The text expressly contains the case or reference identifier “${reference.value}”.`
        : `Text výslovně obsahuje spisový nebo jednací identifikátor „${reference.value}“.`,
      reference.quote,
      'high'
    ));
  }
  for (const institution of institutions.slice(0, 4)) {
    facts.push(groundedItem(
      isEnglish
        ? `The record expressly mentions ${institution.en}.`
        : `Listina výslovně zmiňuje orgán: ${institution.cs}.`,
      institution.quote,
      'high'
    ));
  }
  if (documentKind) {
    facts.push(groundedItem(
      isEnglish
        ? `The quoted passage contains wording associated with ${documentKind.en}.`
        : `Citovaná pasáž obsahuje formulaci spojenou s kategorií „${documentKind.cs}“.`,
      documentKind.quote,
      'high'
    ));
  }
  if (!facts.length) {
    facts.push(groundedItem(
      isEnglish
        ? 'The readable text contains no automatically recognised case reference or public-memory institution.'
        : 'V čitelném textu nebyla automaticky rozpoznána spisová značka ani instituce veřejné paměti.',
      firstQuote,
      'low'
    ));
  }

  const interpretations = [];
  if (documentKind) {
    interpretations.push(groundedItem(
      isEnglish
        ? `Tentative document classification: ${documentKind.en}. This is a text classification, not a ruling on legal effect.`
        : `Pracovní klasifikace listiny: ${documentKind.cs}. Jde o klasifikaci textu, nikoli rozhodnutí o právním účinku.`,
      documentKind.quote,
      'medium'
    ));
  } else {
    interpretations.push(groundedItem(
      isEnglish
        ? 'The document type remains unassigned because the readable excerpt does not contain a sufficiently clear procedural formula.'
        : 'Typ listiny zůstává nezařazen, protože čitelný úryvek neobsahuje dostatečně určitou procesní formulaci.',
      firstQuote,
      'low'
    ));
  }
  for (const placement of placements.slice(0, 5)) {
    interpretations.push({
      claim: isEnglish
        ? `Tentative map placement: ${placement.label}. The quoted identifier proves a textual signal only, not the procedural relationship or outcome.`
        : `Předběžné zařazení do mapy: ${placement.label}. Citovaný identifikátor dokládá pouze textový signál, nikoli procesní vztah nebo výsledek.`,
      citation: placement.citation,
      confidence: 'medium',
      page: placement.page
    });
  }
  if (!placements.length) {
    interpretations.push(groundedItem(
      isEnglish
        ? 'No direct node in the current public procedural map was recognised; a human must decide whether a new node or an unrelated matter is involved.'
        : 'Nebyl rozpoznán přímý uzel současné veřejné procesní mapy; člověk musí určit, zda jde o nový uzel, nebo jinou věc.',
      firstQuote,
      'low'
    ));
  }

  const uncertainties = [];
  const referral = kinds.find(kind => kind.id === 'referral');
  if (referral) {
    uncertainties.push(groundedItem(
      isEnglish
        ? 'The cited referral wording does not itself confirm wrongdoing, the merits of the filing, or the outcome at the receiving authority.'
        : 'Citovaná formulace o postoupení sama nepotvrzuje protiprávnost, důvodnost podání ani výsledek u přijímajícího orgánu.',
      referral.quote,
      'low'
    ));
  }
  const explicitDeadline = quoteForPattern(pages, EXPLICIT_DEADLINE);
  if (explicitDeadline) {
    uncertainties.push(groundedItem(
      isEnglish
        ? 'The text states a date, but the analyzer does not treat it automatically as a statutory deadline and does not calculate legal time limits.'
        : 'Text uvádí datum, ale analyzátor je automaticky nepovažuje za zákonnou lhůtu a právní lhůty nedopočítává.',
      explicitDeadline,
      'low'
    ));
  }
  uncertainties.push(groundedItem(
    isEnglish
      ? 'The automatic reading does not verify the truth of allegations, completeness of the record, service, current procedural status, or applicable law.'
      : 'Automatické čtení neověřuje pravdivost tvrzení, úplnost listiny, doručení, aktuální procesní stav ani použitelné právo.',
    documentKind?.quote || firstQuote,
    'low'
  ));

  const recommendations = [];
  const recommendationQuote = documentKind?.quote || firstQuote;
  if (documentKind?.id === 'referral') {
    recommendations.push(groundedItem(
      isEnglish
        ? 'Proposed check: identify the receiving authority, the forwarding date, the receiving reference and proof that the complete filing was transferred.'
        : 'Návrh řešení: zjistit přijímající orgán, datum předání, novou spisovou značku a doklad, že bylo postoupeno úplné podání.',
      recommendationQuote,
      'recommendation'
    ));
  } else if (documentKind?.id === 'decision') {
    recommendations.push(groundedItem(
      isEnglish
        ? 'Proposed check: verify the operative part, reasoning, service date and remedy instructions before assessing any next procedural step; do not infer a deadline here.'
        : 'Návrh řešení: před úvahou o dalším kroku ověřit výrok, odůvodnění, datum doručení a poučení o opravném prostředku; lhůtu zde nedopočítávat.',
      recommendationQuote,
      'recommendation'
    ));
  } else if (documentKind?.id === 'expert') {
    recommendations.push(groundedItem(
      isEnglish
        ? 'Proposed check: verify the sample, method, measurement uncertainty, THC/THCA distinction and whether the conclusion exceeds the laboratory data.'
        : 'Návrh řešení: ověřit vzorek, metodu, nejistotu měření, rozlišení THC/THCA a zda závěr nepřekračuje laboratorní data.',
      recommendationQuote,
      'recommendation'
    ));
  } else if (documentKind?.id === 'filing') {
    recommendations.push(groundedItem(
      isEnglish
        ? 'Proposed check: compare the requested relief, addressee, attachments and proof of delivery with the authority’s later response.'
        : 'Návrh řešení: porovnat požadovaný výrok, adresáta, přílohy a doklad o doručení s pozdější odpovědí orgánu.',
      recommendationQuote,
      'recommendation'
    ));
  } else {
    recommendations.push(groundedItem(
      isEnglish
        ? 'Proposed check: identify the issuer, date, document type, case reference and the specific question the record can prove before adding it to the map.'
        : 'Návrh řešení: před zařazením do mapy ověřit původce, datum, typ listiny, spisovou značku a konkrétní otázku, kterou může listina dokazovat.',
      recommendationQuote,
      'recommendation'
    ));
  }
  if (caseReferences[0]) {
    recommendations.push(groundedItem(
      isEnglish
        ? `Proposed map action: compare “${caseReferences[0].value}” with the existing chronology and check whether the record creates, changes or merely repeats a node.`
        : `Návrh zařazení: porovnat „${caseReferences[0].value}“ s existující chronologií a ověřit, zda listina uzel zakládá, mění, nebo pouze opakuje.`,
      caseReferences[0].quote,
      'recommendation'
    ));
  }
  if (explicitDeadline) {
    recommendations.push(groundedItem(
      isEnglish
        ? 'Proposed deadline action: record the stated date as source-bound, verify the current status after it passes, and obtain human legal review before treating it as a legal deadline.'
        : 'Návrh práce s termínem: evidovat uvedené datum jako údaj ze zdroje, po jeho uplynutí ověřit aktuální stav a před označením za právní lhůtu zajistit lidskou právní kontrolu.',
      explicitDeadline,
      'recommendation'
    ));
  } else if (dateReferences[0]) {
    recommendations.push(groundedItem(
      isEnglish
        ? `Proposed chronology action: verify what event the stated date “${dateReferences[0].value}” describes before inserting it into the timeline.`
        : `Návrh pro chronologii: před vložením do časové osy ověřit, jakou událost uvedené datum „${dateReferences[0].value}“ označuje.`,
      dateReferences[0].quote,
      'recommendation'
    ));
  }

  return {
    sourceText,
    facts: uniqueGrounded(facts),
    interpretations: uniqueGrounded(interpretations),
    uncertainties: uniqueGrounded(uncertainties),
    recommendations: uniqueGrounded(recommendations),
    placements,
    documentKind: documentKind ? {
      id: documentKind.id,
      label: isEnglish ? documentKind.en : documentKind.cs
    } : null
  };
}

const OUTPUT_GROUPS = ['facts', 'interpretations', 'uncertainties', 'recommendations'];
const REVIEW_FIELDS = ['quotationsChecked', 'privacyAndRightsChecked', 'legalReviewChecked'];

export function validateEvidenceReport(report) {
  const errors = [];
  const sourceText = normalizeSourceText(report?.sourceText);
  let itemCount = 0;

  if (!sourceText) errors.push('missing-source-text');

  for (const group of OUTPUT_GROUPS) {
    if (!Array.isArray(report?.[group])) {
      errors.push(`invalid-group-${group}`);
      continue;
    }
    for (const [index, item] of report[group].entries()) {
      itemCount += 1;
      if (!String(item?.claim || '').trim()) errors.push(`${group}-${index}-missing-claim`);
      if (!String(item?.citation || '').trim()) {
        errors.push(`${group}-${index}-missing-citation`);
      } else if (sourceText && !sourceText.includes(normalizeSourceText(item.citation))) {
        errors.push(`${group}-${index}-citation-not-in-source`);
      }
      if (!['high', 'medium', 'low', 'recommendation'].includes(item?.confidence)) {
        errors.push(`${group}-${index}-invalid-confidence`);
      }
    }
  }

  if (!itemCount) errors.push('no-grounded-items');

  return {
    valid: errors.length === 0,
    errors,
    itemCount
  };
}

export function safePublicSourceReference(rawUrl) {
  if (!rawUrl) return null;
  const url = validateEvidenceUrl(rawUrl);
  const removedSensitiveParts = Boolean(url.search || url.hash);
  url.search = '';
  url.hash = '';
  return {
    url: url.href,
    removedSensitiveParts
  };
}

function safePacketName(value) {
  const clean = String(value || 'document')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '-')
    .trim();
  return clean.slice(0, 180) || 'document';
}

function packetGroups(analysis) {
  return Object.fromEntries(
    OUTPUT_GROUPS.map(group => [
      group,
      (analysis[group] || []).map(item => ({
        claim: String(item.claim),
        citation: String(item.citation),
        confidence: String(item.confidence),
        page: Number.isInteger(item.page) ? item.page : null
      }))
    ])
  );
}

export function buildPublicationPacket({
  analysis,
  fingerprint,
  fileName,
  sourceUrl = null,
  sourceLabel = null,
  language = 'cs',
  exactSupportedIdentity = false,
  supportedIdentityLabel = null,
  review = {},
  generatedAt = new Date().toISOString()
}) {
  const grounding = validateEvidenceReport(analysis);
  const reviewState = Object.fromEntries(
    REVIEW_FIELDS.map(field => [field, review[field] === true])
  );
  const humanReviewComplete = REVIEW_FIELDS.every(field => reviewState[field]);
  let sourceReference = null;
  try {
    sourceReference = safePublicSourceReference(sourceUrl);
  } catch {
    sourceReference = null;
  }

  const eligible = grounding.valid
    && analysis?.score !== null
    && humanReviewComplete;
  const status = !grounding.valid || analysis?.score === null
    ? 'blocked'
    : eligible
      ? 'publication-candidate'
      : 'human-review-required';

  return {
    schema: 'cannainsider-publication-candidate',
    schemaVersion: 1,
    generatedAt,
    language: language === 'en' ? 'en' : 'cs',
    status,
    notice: language === 'en'
      ? 'Demonstration output. It is not legal advice and is not published until a reviewed pull request is merged.'
      : 'Demonstrační výstup. Nejde o právní radu a není zveřejněn, dokud není sloučen zkontrolovaný pull request.',
    source: {
      fileName: safePacketName(fileName),
      sha256: String(fingerprint || ''),
      publicUrl: sourceReference?.url || null,
      sourceLabel: sourceLabel ? safePacketName(sourceLabel) : null,
      urlQueryOrFragmentRemoved: sourceReference?.removedSensitiveParts || false,
      charactersRead: Number(analysis?.charactersRead || 0),
      pagesRead: Number.isInteger(analysis?.pagesRead) ? analysis.pagesRead : null,
      pagesTotal: Number.isInteger(analysis?.pagesTotal) ? analysis.pagesTotal : null
    },
    identity: {
      exactSupportedFingerprintMatch: exactSupportedIdentity === true,
      label: supportedIdentityLabel ? String(supportedIdentityLabel) : null,
      boundary: language === 'en'
        ? 'A fingerprint match identifies a supported record; it does not prove every statement in it.'
        : 'Shoda otisku určuje podporovanou listinu; nedokazuje každé tvrzení v ní.'
    },
    relevance: {
      score: analysis?.scoreLabel || '—',
      level: analysis?.level || 'black',
      meaning: String(analysis?.meaning || ''),
      detectedSignals: Array.isArray(analysis?.matches) ? analysis.matches.map(String) : []
    },
    mapPlacements: (analysis?.placements || []).map(placement => ({
      label: String(placement.label || ''),
      status: 'tentative',
      citation: String(placement.citation || ''),
      page: Number.isInteger(placement.page) ? placement.page : null
    })),
    analysis: packetGroups(analysis || {}),
    grounding,
    humanReview: {
      ...reviewState,
      complete: humanReviewComplete,
      boundary: language === 'en'
        ? 'These browser checkboxes record an editorial attestation only; repository review and publication tests remain required.'
        : 'Zaškrtávací pole v prohlížeči zaznamenávají pouze redakční potvrzení; nadále je nutná kontrola repozitáře a publikační testy.'
    }
  };
}

function markdownGroup(title, items, language) {
  const empty = language === 'en' ? '_No grounded item._' : '_Žádná citovaná položka._';
  if (!items?.length) return `## ${title}\n\n${empty}`;
  const rows = items.map((item, index) => {
    const page = item.page
      ? ` (${language === 'en' ? 'page' : 'strana'} ${item.page})`
      : '';
    return `${index + 1}. ${item.claim}\n\n   > ${item.citation}${page}\n\n   _${item.confidence}_`;
  });
  return `## ${title}\n\n${rows.join('\n\n')}`;
}

export function buildPublicationMarkdown(packet) {
  const language = packet?.language === 'en' ? 'en' : 'cs';
  const labels = language === 'en'
    ? {
        title: 'Publication candidate — human review required',
        status: 'Workflow status',
        source: 'Source',
        hash: 'SHA-256',
        facts: 'Source-grounded facts',
        interpretations: 'Tentative classification and interpretation',
        uncertainties: 'Uncertainty and boundaries',
        recommendations: 'Proposed solutions and checks',
        review: 'Review gate',
        warning: 'This file is a draft, not a published report or legal advice.'
      }
    : {
        title: 'Kandidát publikace — nutná lidská kontrola',
        status: 'Stav procesu',
        source: 'Zdroj',
        hash: 'SHA-256',
        facts: 'Doložená fakta',
        interpretations: 'Pracovní zařazení a výklad',
        uncertainties: 'Nejistoty a hranice',
        recommendations: 'Návrhy řešení a dalších kontrol',
        review: 'Kontrolní brána',
        warning: 'Tento soubor je návrh, nikoli zveřejněný článek ani právní rada.'
      };
  const source = packet?.source || {};
  const groups = packet?.analysis || {};
  const review = packet?.humanReview || {};
  const reviewRows = REVIEW_FIELDS.map(field => `- [${review[field] ? 'x' : ' '}] ${field}`).join('\n');

  return [
    `# ${labels.title}`,
    '',
    `> ${labels.warning}`,
    '',
    `- **${labels.status}:** \`${packet?.status || 'blocked'}\``,
    `- **${labels.source}:** ${source.publicUrl || source.sourceLabel || source.fileName || '—'}`,
    `- **${labels.hash}:** \`${source.sha256 || '—'}\``,
    '',
    markdownGroup(labels.facts, groups.facts, language),
    '',
    markdownGroup(labels.interpretations, groups.interpretations, language),
    '',
    markdownGroup(labels.uncertainties, groups.uncertainties, language),
    '',
    markdownGroup(labels.recommendations, groups.recommendations, language),
    '',
    `## ${labels.review}`,
    '',
    reviewRows,
    '',
    packet?.notice || ''
  ].join('\n');
}

function isPrivateOrLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  if (/^(?:0|10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const private172 = /^172\.(\d{1,3})\./.exec(host);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

export function validateEvidenceUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('invalid-url');
  }
  if (url.protocol !== 'https:') throw new Error('https-required');
  if (url.username || url.password) throw new Error('credentials-not-allowed');
  if (isPrivateOrLocalHost(url.hostname)) throw new Error('private-host-not-allowed');
  return url;
}

async function readResponseBytes(response, maximumBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error('pdf-too-large');

  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maximumBytes) throw new Error('pdf-too-large');
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error('pdf-too-large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function safeRemoteFilename(url) {
  const pathPart = decodeURIComponent(url.pathname.split('/').pop() || 'external-document.pdf');
  const clean = pathPart.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean || 'external-document'}.pdf`;
}

export async function fetchExternalPdf(rawUrl, options = {}) {
  const url = validateEvidenceUrl(rawUrl);
  const maximumBytes = options.maximumBytes || MAX_EXTERNAL_PDF_BYTES;
  const fetchImplementation = options.fetchImplementation || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20_000);
  let response;

  try {
    response = await fetchImplementation(url.href, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/pdf' },
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === 'AbortError') throw new Error('download-timeout');
    throw new Error('download-blocked');
  }

  let bytes;
  try {
    if (!response.ok) throw new Error(`download-http-${response.status}`);
    if (response.url) validateEvidenceUrl(response.url);
    bytes = await readResponseBytes(response, maximumBytes);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('download-timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const signature = new TextDecoder('ascii').decode(bytes.slice(0, 5));
  if (signature !== '%PDF-') throw new Error('not-a-pdf');

  const finalUrl = new URL(response.url || url.href);
  const filename = safeRemoteFilename(finalUrl);
  const file = typeof File === 'function'
    ? new File([bytes], filename, { type: 'application/pdf' })
    : Object.assign(new Blob([bytes], { type: 'application/pdf' }), { name: filename });

  return {
    file,
    sourceUrl: finalUrl.href,
    sourceLabel: `${finalUrl.hostname}${finalUrl.pathname}`,
    size: bytes.length
  };
}

async function extractPdfText(file) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
  const data = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjs.getDocument({ data, isEvalSupported: false });
  const pdf = await documentTask.promise;
  const pageLimit = Math.min(pdf.numPages, 120);
  const chunks = [];
  const pages = [];
  let characterCount = 0;

  for (let pageNumber = 1; pageNumber <= pageLimit && characterCount < 400000; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str || '').join(' ');
    chunks.push(pageText);
    pages.push({ pageNumber, text: pageText });
    characterCount += pageText.length;
  }

  return {
    text: chunks.join('\n'),
    pages,
    pagesRead: pageLimit,
    pagesTotal: pdf.numPages
  };
}

export async function analyzeUnknownFile(file, language = 'cs') {
  let extracted;
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    extracted = await extractPdfText(file);
  } else {
    const text = await file.text();
    extracted = { text, pages: [{ pageNumber: null, text }], pagesRead: null, pagesTotal: null };
  }

  if (extracted.text.replace(/\s+/g, '').length < 80) {
    return {
      score: null,
      scoreLabel: '—',
      level: 'black',
      matches: [],
      title: language === 'en'
        ? 'Relevance was not evaluated: the PDF has no readable text layer'
        : 'Relevance nebyla vyhodnocena: PDF nemá čitelnou textovou vrstvu',
      meaning: language === 'en'
        ? 'A scan without extractable text cannot be compared with the evidence memory; this is not a zero-relevance result.'
        : 'Sken bez získatelného textu nelze porovnat s důkazní pamětí; nejde o výsledek nulové relevance.',
      next: language === 'en'
        ? 'Run OCR or provide a text-searchable PDF, then repeat the local check.'
        : 'Proveďte OCR nebo vložte PDF s prohledávatelným textem a místní kontrolu zopakujte.',
      charactersRead: extracted.text.length,
      pagesRead: extracted.pagesRead,
      pagesTotal: extracted.pagesTotal,
      sourceText: normalizeSourceText(extracted.text),
      facts: [],
      interpretations: [],
      uncertainties: [],
      recommendations: [],
      placements: [],
      documentKind: null
    };
  }

  const result = scoreEvidenceText(extracted.text, language);
  const report = buildEvidenceReport(extracted.pages || extracted.text, language);
  return {
    ...result,
    ...report,
    charactersRead: extracted.text.length,
    pagesRead: extracted.pagesRead,
    pagesTotal: extracted.pagesTotal
  };
}
