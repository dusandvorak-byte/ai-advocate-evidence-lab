import { readFile } from 'node:fs/promises';

const ANCHORED_FILINGS = [
  'doc-cz-ekk-2026-11-03-nsz-dukazni-doplneni',
  'doc-cz-dd-2026-11-04-os-pro-stiznosti-obhajoba',
  'doc-cz-dd-2026-11-03-okte-srovnavaci-analyza',
  'doc-cz-ekk-2026-11-03-stiznost-krpm-145410',
  'doc-cz-dd-2026-11-04-cak-urgence-advokata',
];

export function validateNavigationPages({ cz, en, churchEn, englishChronology = '', details, documents = [] }) {
  const errors = [];
  const targetIds = new Set([...cz.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const byId = new Map(documents.map(item => [item.id, item]));

  for (const id of ANCHORED_FILINGS) {
    if (!cz.includes(`<tr id="${id}" data-slalom-id=`)) {
      errors.push(`Missing Justice Slalom row anchor: ${id}`);
    }

    const detail = details[id] || '';
    const link = detail.match(/href="zpravy\/04082026-010\.html#([^"]+)"/);
    if (!link) {
      errors.push(`Missing detail page return link: ${id}`);
      continue;
    }

    const doc = byId.get(id);
    const fallback = doc?.submission_side === 'outgoing_from_user_or_alliance'
      ? 'justicni-slalom'
      : 'chronologie';
    const allowed = new Set([id, fallback]);
    const fragment = link[1];

    if (!allowed.has(fragment) || !targetIds.has(fragment)) {
      errors.push(`Invalid detail return target for ${id}: #${fragment}; allowed #${id} or #${fallback}`);
    }
    if (fragment === 'justicni-slalom' && !detail.includes('Přejít na přehled podání')) {
      errors.push(`Outgoing fallback label mismatch: ${id}`);
    }
    if (fragment === 'chronologie' && !detail.includes('Přejít na přehled chronologie')) {
      errors.push(`Chronology fallback label mismatch: ${id}`);
    }
  }

  if (!cz.includes('href="/ai-advocate-evidence-lab/news/04082026-010.html" hreflang="en"')) {
    errors.push('Czech Godot chronology missing direct English counterpart');
  }
  if (!en.includes('href="zpravy/04082026-010.html" hreflang="cs">Czech canonical chronology')) {
    errors.push('English homepage links Czech canonical chronology to incorrect EN target');
  }
  const historicalId = 'doc-cz-ns-2026-11-03-zin-208-2026-postoupeni';
  const legacyPriority = new Map([
    ['doc-cz-mk-2026-08-12-mk-49467-2026-socns', 0],
    ['doc-cz-kpr-2026-08-12-4873-2026', 1],
    ['doc-cz-mv-2026-08-11-mv-127234-2-obp-2026', 2]
  ]);
  const expected = documents.filter(item => item.issue_date >= '2026-05-01' &&
    item.document_type === 'state_record' && item.release_excluded !== true)
    .sort((a,b) => String(b.issue_date).localeCompare(String(a.issue_date)) ||
      (legacyPriority.get(a.id) ?? 999) - (legacyPriority.get(b.id) ?? 999) ||
      String(a.id).localeCompare(String(b.id))).slice(0,3).map(item=>item.id);
  if (expected.length !== 3) errors.push('Canonical latest records incomplete');
  const englishRows = new Map();
  for (const match of englishChronology.matchAll(/<tr\b[^>]*\bid="en-([^"]+)"[^>]*>[\s\S]*?<\/tr>/g)) {
    if (englishRows.has(match[1])) errors.push('Duplicate English chronology row: '+match[1]);
    englishRows.set(match[1],match[0]);
  }
  const historicalRow = englishRows.get(historicalId) || '';
  if (!byId.has(historicalId) || !historicalRow.includes('Supreme Court forwards complaint about its information response to the data protection authority')) {
    errors.push('Missing historical NS Zin 208 English chronology translation');
  }
  for (const [name, text] of [['EN homepage', en], ['EN church homepage', churchEn]]) {
    const cards = [...text.matchAll(/<article class="latest-record-card" data-document-id="([^"]+)">([\s\S]*?)<\/article>/g)];
    if (JSON.stringify(cards.map(m=>m[1])) !== JSON.stringify(expected)) errors.push(name+' latest card IDs/order mismatch');
    for (const [,id,body] of cards) {
      const link = body.match(/<h3><a href="(?:\/ai-advocate-evidence-lab\/)?news\/04082026-010\.html#en-([^"]+)" hreflang="en">([^<]+)<\/a><\/h3>/);
      if (!link || link[1] !== id || !link[2].trim() || !englishRows.has(id)) errors.push(name+' invalid English latest card link or title: '+id);
      if (id === historicalId && !body.includes('The Supreme Court forwarded the complaint')) errors.push(name+' missing English NS Zin 208 card text');
    }
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
  const registry = JSON.parse(await readFile('web/data/documents-2026.json', 'utf8'));
  const pages = {
    cz: await readFile('web/zpravy/04082026-010.html', 'utf8'),
    en: await readFile('web/en.html', 'utf8'),
    churchEn: await readFile('web/kc/en.html', 'utf8'),
    englishChronology: await readFile('web/news/04082026-010.html', 'utf8'),
    details,
    documents: registry.documents || [],
  };
  const errors = validateNavigationPages(pages);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Public navigation PASS: 5 filing returns resolve to exact rows or approved safe section fallbacks; CZ/EN destinations and redacted PDF label valid');
}

if (process.argv[1]?.endsWith('validate-public-navigation.mjs')) {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}
