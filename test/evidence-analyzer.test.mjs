import assert from 'node:assert/strict';
import {
  buildPublicationMarkdown,
  buildPublicationPacket,
  buildEvidenceReport,
  fetchExternalPdf,
  safePublicSourceReference,
  scoreEvidenceText,
  validateEvidenceReport,
  validateEvidenceUrl
} from '../web/evidence-analyzer.js';

const unrelated = scoreEvidenceText('Faktura za opravu střechy a dodání materiálu.');
assert.equal(unrelated.scoreLabel, '0/0');
assert.match(unrelated.meaning, /význam v jiné věci/);

const generalCannabisCase = scoreEvidenceText(
  'Soud projednává stížnost ve věci pěstování konopí a obsahu THC.'
);
assert.equal(generalCannabisCase.scoreLabel, '3/9');
assert.match(generalCannabisCase.meaning, /stejného právního nebo důkazního problému/);

const directCase = scoreEvidenceText(
  'Okresní soud v Ostravě sp. zn. 15 T 11/2025 rozhoduje ve věci konopí.'
);
assert.equal(directCase.scoreLabel, '8/9');
assert.ok(directCase.matches.includes('15 T 11/2025'));

const directMeasurementCase = scoreEvidenceText(
  'Ve věci 45 T 1/2024 soud kontroluje vzorek konopí, THC a nejistotu měření laboratoře.'
);
assert.equal(directMeasurementCase.scoreLabel, '9/9');
assert.match(directMeasurementCase.meaning, /přednostní lidské kontrole/);

const churchProceeding = scoreEvidenceText(
  'Ministerstvo kultury vede pod číslem MK 45728/2026 SOCNS podání Konopné církve.'
);
assert.equal(churchProceeding.scoreLabel, '9/9');
assert.equal(churchProceeding.verifiedIdentity, false);
assert.equal(churchProceeding.legalConclusion, false);

const referralOnly = scoreEvidenceText(
  'Podání bylo postoupeno jinému státnímu zastupitelství k dalšímu opatření.'
);
assert.equal(referralOnly.legalConclusion, false);
assert.doesNotMatch(referralOnly.title, /vina|protiprávní|wrongdoing|guilt/i);

const appendedReference = scoreEvidenceText(
  'Faktura za opravu střechy. Příloha pro vyhledávání: sp. zn. 15 T 11/2025.'
);
assert.ok(appendedReference.score < 9);
assert.equal(appendedReference.verifiedIdentity, false);

const structuredReferralSource = [
  'Nejvyšší státní zastupitelství sděluje, že podání vedené pod sp. zn. 6 NZN 1737/2026 bylo postoupeno Městskému státnímu zastupitelství v Praze.',
  'Vyrozumění je datováno 20. července 2026.'
].join(' ');
const structuredReferral = buildEvidenceReport(structuredReferralSource);
assert.equal(structuredReferral.documentKind.id, 'referral');
assert.ok(structuredReferral.facts.length >= 2);
assert.ok(structuredReferral.interpretations.length >= 2);
assert.ok(structuredReferral.uncertainties.some(item => /sama nepotvrzuje protiprávnost/.test(item.claim)));
assert.ok(structuredReferral.recommendations.some(item => /přijímající orgán/.test(item.claim)));
assert.ok(structuredReferral.placements.some(item => /6 NZN 1737\/2026/.test(item.label)));

for (const group of ['facts', 'interpretations', 'uncertainties', 'recommendations']) {
  for (const item of structuredReferral[group]) {
    assert.ok(item.claim, `${group} item must have a claim`);
    assert.ok(item.citation, `${group} item must have a quotation`);
    assert.ok(item.confidence, `${group} item must have a confidence marker`);
    assert.ok(
      structuredReferral.sourceText.includes(item.citation),
      `${group} quotation must occur verbatim in the readable source`
    );
  }
}

const grounding = validateEvidenceReport(structuredReferral);
assert.equal(grounding.valid, true);
assert.ok(grounding.itemCount >= 4);

const alteredCitation = structuredClone(structuredReferral);
alteredCitation.facts[0].citation = 'Tato věta ve zdrojové listině není.';
assert.equal(validateEvidenceReport(alteredCitation).valid, false);
assert.ok(validateEvidenceReport(alteredCitation).errors.some(error => /citation-not-in-source/.test(error)));

const sourceReference = safePublicSourceReference(
  'https://example.org/public/record.pdf?temporary-token=secret#page=2'
);
assert.equal(sourceReference.url, 'https://example.org/public/record.pdf');
assert.equal(sourceReference.removedSensitiveParts, true);

const reviewRequiredPacket = buildPublicationPacket({
  analysis: structuredReferral,
  fingerprint: 'a'.repeat(64),
  fileName: 'NSZ referral.pdf',
  sourceUrl: 'https://example.org/public/record.pdf?temporary-token=secret',
  sourceLabel: 'example.org/public/record.pdf',
  generatedAt: '2026-07-28T08:00:00.000Z'
});
assert.equal(reviewRequiredPacket.status, 'human-review-required');
assert.equal(reviewRequiredPacket.source.publicUrl, 'https://example.org/public/record.pdf');
assert.equal(reviewRequiredPacket.source.urlQueryOrFragmentRemoved, true);
assert.equal(reviewRequiredPacket.humanReview.complete, false);

const publicationCandidate = buildPublicationPacket({
  analysis: structuredReferral,
  fingerprint: 'a'.repeat(64),
  fileName: 'NSZ referral.pdf',
  sourceUrl: 'https://example.org/public/record.pdf',
  exactSupportedIdentity: false,
  review: {
    quotationsChecked: true,
    privacyAndRightsChecked: true,
    legalReviewChecked: true
  },
  generatedAt: '2026-07-28T08:00:00.000Z'
});
assert.equal(publicationCandidate.status, 'publication-candidate');
assert.equal(publicationCandidate.humanReview.complete, true);
const publicationMarkdown = buildPublicationMarkdown(publicationCandidate);
assert.match(publicationMarkdown, /Kandidát publikace/);
assert.match(publicationMarkdown, /Citovaná formulace o postoupení sama nepotvrzuje protiprávnost/);
assert.doesNotMatch(publicationMarkdown, /postoupení potvrzuje protiprávnost/i);

const deadlineReport = buildEvidenceReport(
  'Ministerstvo kultury sděluje, že další postup oznámí nejpozději do 31. srpna 2026.'
);
assert.ok(deadlineReport.uncertainties.some(item => /automaticky nepovažuje za zákonnou lhůtu/.test(item.claim)));
assert.ok(deadlineReport.recommendations.some(item => /nedopočít/.test(item.claim) || /lidskou právní kontrolu/.test(item.claim)));

const emptyReport = buildEvidenceReport('');
assert.deepEqual(emptyReport.facts, []);
assert.deepEqual(emptyReport.recommendations, []);

assert.equal(validateEvidenceUrl('https://example.org/public/record.pdf').hostname, 'example.org');
assert.throws(() => validateEvidenceUrl('http://example.org/record.pdf'), /https-required/);
assert.throws(() => validateEvidenceUrl('https://user:secret@example.org/record.pdf'), /credentials-not-allowed/);
assert.throws(() => validateEvidenceUrl('https://127.0.0.1/record.pdf'), /private-host-not-allowed/);
assert.throws(() => validateEvidenceUrl('https://intranet.local/record.pdf'), /private-host-not-allowed/);

const pdfBytes = new TextEncoder().encode('%PDF-1.7\nminimal test payload');
const externalPdf = await fetchExternalPdf('https://example.org/public/record.pdf', {
  fetchImplementation: async () => new Response(pdfBytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdfBytes.length)
    }
  })
});
assert.equal(externalPdf.size, pdfBytes.length);
assert.equal(externalPdf.file.type, 'application/pdf');
assert.match(externalPdf.file.name, /\.pdf$/);

await assert.rejects(
  fetchExternalPdf('https://example.org/not-pdf', {
    fetchImplementation: async () => new Response('<html>not a PDF</html>', { status: 200 })
  }),
  /not-a-pdf/
);

console.log('Evidence relevance, grounding and external PDF tests passed');
