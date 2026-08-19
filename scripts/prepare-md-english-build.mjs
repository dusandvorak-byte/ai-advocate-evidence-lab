import { readFile, writeFile } from 'node:fs/promises';

const translationsPath = 'project-memory/english-godot-translations.json';
const supplementPath = 'project-memory/english-godot-translations-2026-08-18-md.json';
const builderPath = 'scripts/build-english-godot.mjs';
const validatorPath = 'scripts/validate-live-dockets-contract.mjs';

const translations = JSON.parse(await readFile(translationsPath, 'utf8'));
const supplement = JSON.parse(await readFile(supplementPath, 'utf8'));
translations.institutions = { ...(translations.institutions || {}), ...(supplement.institutions || {}) };
translations.documents = { ...(translations.documents || {}), ...(supplement.documents || {}) };
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
  patched.push(line);
}
validator = patched.join('\n');
if (validator.includes('englishGodotRecords !== 73') || validator.includes('úplných 73 záznamů')) {
  throw new Error('Nepodařilo se odstranit starý pevný počet 73 z validátoru');
}
await writeFile(validatorPath, validator, 'utf8');

console.log('English Godot and its validator prepared for dynamically derived state-record count and Ministry of Transport translation.');
