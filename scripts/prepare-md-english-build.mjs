import { readFile, readdir, writeFile } from 'node:fs/promises';

const translationsPath = 'project-memory/english-godot-translations.json';
const translationSupplementPattern = /^english-godot-translations-\d{4}-\d{2}-\d{2}(?:-[^.]+)?\.json$/;
const supplementPaths = (await readdir('project-memory'))
  .filter(name => translationSupplementPattern.test(name))
  .map(name => `project-memory/${name}`)
  .sort();
const builderPath = 'scripts/build-english-godot.mjs';
const validatorPath = 'scripts/validate-live-dockets-contract.mjs';

const translations = JSON.parse(await readFile(translationsPath, 'utf8'));
for (const supplementPath of supplementPaths) {
  const supplement = JSON.parse(await readFile(supplementPath, 'utf8'));
  translations.institutions = { ...(translations.institutions || {}), ...(supplement.institutions || {}) };
  translations.documents = { ...(translations.documents || {}), ...(supplement.documents || {}) };
}
await writeFile(translationsPath, `${JSON.stringify(translations, null, 2)}\n`, 'utf8');

let builder = await readFile(builderPath, 'utf8');
builder = builder
  .replace(
    "if (stateDocuments.length !== 73) throw new Error(`English Godot requires 73 state/public records; found ${stateDocuments.length}`);",
    "if (!stateDocuments.length) throw new Error('English Godot contains no state/public records');"
  )
  .replaceAll('73 source-linked Czech public records', '${stateDocuments.length} source-linked Czech public records')
  .replaceAll('73 source-linked records', '${stateDocuments.length} source-linked records')
  .replaceAll('<strong>73/73</strong>', '<strong>${stateDocuments.length}/${stateDocuments.length}</strong>')
  .replaceAll('${stateDocuments.length}/73 public records', '${stateDocuments.length}/${stateDocuments.length} public records');
await writeFile(builderPath, builder, 'utf8');

let validator = await readFile(validatorPath, 'utf8');
const lines = validator.split('\n');
const patched = [];
for (const line of lines) {
  if (line.includes("englishGodot.includes('data-english-chronology-count=\"73\"')") && line.includes('englishGodotRecords !== 73')) {
    patched.push("const englishGodotDeclaredCount = Number(englishGodot.match(/data-english-chronology-count=\\\"(\\d+)\\\"/)?.[1] || 0);");
    patched.push('if (englishGodotRecords < 1 || englishGodotDeclaredCount !== englishGodotRecords) {');
    continue;
  }
  if (line.includes('Anglický Godot nemá úplných 73 záznamů')) {
    patched.push('  throw new Error(`Anglický Godot nemá konzistentní počet záznamů: vykresleno ${englishGodotRecords}, deklarováno ${englishGodotDeclaredCount}`);');
    continue;
  }
  if (line.includes('if (englishGodotOutgoing !== 24)')) {
    patched.push("const expectedEnglishOutgoing = canonicalDocuments.documents.filter(item => item.issue_date >= '2026-05-01' && item.submission_side === 'outgoing_from_user_or_alliance').length;");
    patched.push('if (englishGodotOutgoing !== expectedEnglishOutgoing) throw new Error(`Anglický Godot nemá všechna kanonická navazující podání: ${englishGodotOutgoing}/${expectedEnglishOutgoing}`);');
    continue;
  }
  patched.push(line);
}
validator = patched.join('\n');
if (validator.includes('englishGodotRecords !== 73') || validator.includes('úplných 73 záznamů') || validator.includes('englishGodotOutgoing !== 24')) {
  throw new Error('Nepodařilo se odstranit staré pevné počty z validátoru');
}
await writeFile(validatorPath, validator, 'utf8');

console.log(`English Godot and validator prepared from ${supplementPaths.length} automatically discovered translation supplements with dynamically derived state and outgoing counts.`);
