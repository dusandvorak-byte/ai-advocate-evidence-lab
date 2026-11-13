import { readFile } from 'node:fs/promises';

const ANCHORED_FILINGS = [
  'doc-cz-ekk-2026-11-03-nsz-dukazni-doplneni',
  'doc-cz-dd-2026-11-04-os-pro-stiznosti-obhajoba',
  'doc-cz-dd-2026-11-03-okte-srovnavaci-analyza',
  'doc-cz-ekk-2026-11-03-stiznost-krpm-145410',
  'doc-cz-dd-2026-11-04-cak-urgence-advokata',
];

export function validateNavigationPages({ cz, en, churchEn, details }) {
  const errors = [];
  for (const id of ANCHORED_FILINGS) {
    if (!cz.includes(`<tr id="${id}" data-slalom-id=`)) {
      errors.push(`Missing Justice Slalom row anchor: ${id}`);
    }
    if (!details[id]?.includes(`href="zpravy/04082026-010.html#${id}"`)) {
      errors.push(`Missing detail page return link: ${id}`);
    }
  }
  if (!cz.includes('href="/ai-advocate-evidence-lab/news/04082026-010.html" hreflang="en"')) {
    errors.push('Czech Godot chronology missing direct English counterpart');
  }
  if (!en.includes('href="zpravy/04082026-010.html" hreflang="cs">Czech canonical chronology')) {
    errors.push('English homepage links Czech canonical chronology to incorrect EN target');
  }
  for (const [name, text] of [['EN homepage', en], ['EN church homepage', churchEn]]) {
    if (!text.includes('The Supreme Court forwarded the complaint')) {
      errors.push(`${name} missing English NS Zin 208 card text`);
    }
    if (!text.includes('hreflang="en"')) errors.push(`${name} missing English card language metadata`);
  }
  if (!details['doc-cz-dd-2026-11-03-okte-srovnavaci-analyza']?.includes('Otevřít redigovanou veřejnou kopii PDF')) {
    errors.push('OKTE analysis page describes redacted derivative as original');
  }
  return errors;
}

async function main() {
  const details = Object.fromEntries(await Promise.all(ANCHORED_FILINGS.map(async id =>
    [id, await readFile(`web/listiny/${id}.html`, 'utf8')])
  ));
  const pages = {
    cz: await readFile('web/zpravy/04082026-010.html', 'utf8'),
    en: await readFile('web/en.html', 'utf8'),
    churchEn: await readFile('web/kc/en.html', 'utf8'),
    details,
  };
  const errors = validateNavigationPages(pages);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Public navigation PASS: 5 back-links, CZ/EN destinations, redacted PDF label');
}

if (process.argv[1]?.endsWith('validate-public-navigation.mjs')) {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}
