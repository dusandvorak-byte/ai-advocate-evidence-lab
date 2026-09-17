import { readFile } from 'node:fs/promises';

const hero = 'web/assets/votruba/zpivej-kopie.jpg';
const canonical = 'web/assets/votruba/sing.jpg';
const [heroBytes, canonicalBytes] = await Promise.all([readFile(hero), readFile(canonical)]);

function validJpeg(bytes) {
  return bytes.length >= 10000 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

if (!validJpeg(heroBytes)) throw new Error(`Votruba hero gate: ${hero} is missing, truncated or not a complete JPEG (${heroBytes.length} bytes).`);
if (!heroBytes.equals(canonicalBytes)) throw new Error(`Votruba hero gate: ${hero} must be byte-identical to ${canonical}.`);

console.log(`Votruba hero gate OK: ${heroBytes.length} bytes, complete JPEG, byte-identical to canonical sing.jpg.`);
