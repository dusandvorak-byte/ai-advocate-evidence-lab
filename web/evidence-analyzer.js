const MEMORY_SIGNALS = [
  { label: '15 T 11/2025', weight: 5, pattern: /\b15\s*T\s*11\s*[\/-]\s*2025\b/i },
  { label: '45 T 1/2024', weight: 5, pattern: /\b45\s*T\s*1\s*[\/-]\s*2024\b/i },
  { label: '2 T 104/2010', weight: 5, pattern: /\b2\s*T\s*104\s*[\/-]\s*2010\b/i },
  { label: '18 A 17/2026', weight: 5, pattern: /\b18\s*A\s*17\s*[\/-]\s*2026\b/i },
  { label: '18 A 23/2026', weight: 5, pattern: /\b18\s*A\s*23\s*[\/-]\s*2026\b/i },
  { label: '8 Ad 9/2026', weight: 5, pattern: /\b8\s*Ad\s*9\s*[\/-]\s*2026\b/i },
  { label: '1 KZT 475/2026', weight: 5, pattern: /\b1\s*KZT\s*475\s*[\/-]\s*2026\b/i },
  { label: '2 KZN 55/2026', weight: 5, pattern: /\b2\s*KZN\s*55\s*[\/-]\s*2026\b/i },
  { label: 'KRPM-100092', weight: 5, pattern: /KRPM[\s-]*100092/i },
  { label: 'MV-114818-2/TP-2026', weight: 5, pattern: /MV[\s-]*114818[\s-]*2\s*[\/-]\s*TP[\s-]*2026/i },
  { label: 'MK 45728/2026 SOCNS', weight: 5, pattern: /MK\s*45728\s*[\/-]\s*2026\s*SOCNS/i },
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

async function extractPdfText(file) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
  const data = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjs.getDocument({ data, isEvalSupported: false });
  const pdf = await documentTask.promise;
  const pageLimit = Math.min(pdf.numPages, 120);
  const chunks = [];
  let characterCount = 0;

  for (let pageNumber = 1; pageNumber <= pageLimit && characterCount < 400000; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str || '').join(' ');
    chunks.push(pageText);
    characterCount += pageText.length;
  }

  return {
    text: chunks.join('\n'),
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
    extracted = { text, pagesRead: null, pagesTotal: null };
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
      pagesTotal: extracted.pagesTotal
    };
  }

  const result = scoreEvidenceText(extracted.text, language);
  return {
    ...result,
    charactersRead: extracted.text.length,
    pagesRead: extracted.pagesRead,
    pagesTotal: extracted.pagesTotal
  };
}
