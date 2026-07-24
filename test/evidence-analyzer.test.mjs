import assert from 'node:assert/strict';
import { scoreEvidenceText } from '../web/evidence-analyzer.js';

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

console.log('Evidence relevance tests: 7 passed');
