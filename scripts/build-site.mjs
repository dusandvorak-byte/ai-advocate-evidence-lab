import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const WEB = path.join(ROOT, 'web');
const ARTICLE = path.join(WEB, 'zpravy', '04082026-010.html');
const HOME = path.join(WEB, 'index.html');
const REGISTRY = path.join(ROOT, 'project-memory', 'documents-2026.json');
const INSTITUTIONS = path.join(ROOT, 'project-memory', 'institutions.json');
const AXIOMS = path.join(ROOT, 'project-memory', 'publication-axioms.json');
const CORRECT_TITLE = 'Pavouk řízení od 1. května 2026, aneb Kdy přijde Godot?';
const WRONG_TITLE = 'Pavouk český křižák z Branibor';
const REQUIRED_BARS = [
  'Aktivní soudní řízení on-line od 1. května 2026',
  'Předžalobní řízení on-line od 1. května 2026',
  'Státní láska online od 1. května 2026'
];

const fail = message => {
  throw new Error(`[build-site] ${message}`);
};

const exists = async file => {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const readJson = async file => {
  if (!(await exists(file))) fail(`Chybí povinný registr ${path.relative(ROOT, file)}`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    fail(`Neplatný JSON v ${path.relative(ROOT, file)}: ${error.message}`);
  }
};

const run = script => {
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8'
  });
  if (result.status !== 0) fail(`Selhal generátor ${script}`);
};

const normalizePublicPath = value => {
  if (!value || /^(?:https?:|mailto:|#)/i.test(value)) return null;
  return value.replace(/^\/+/, '').replace(/^web\//, '');
};

const validateRegistries = async () => {
  const registry = await readJson(REGISTRY);
  const institutions = await readJson(INSTITUTIONS);
  const axioms = await readJson(AXIOMS);

  if (!Array.isArray(registry.documents)) fail('documents-2026.json neobsahuje pole documents');
  if (!Array.isArray(institutions.institutions)) fail('institutions.json neobsahuje pole institutions');
  if (!Array.isArray(axioms.axioms) || axioms.axioms.length < 6) fail('publication-axioms.json neobsahuje úplný soubor axiomů');

  const institutionIds = new Set(institutions.institutions.map(item => item.id));
  const ids = new Set();
  const missingInstitutions = [];
  const badPaths = [];

  for (const item of registry.documents) {
    if (!item.id || !item.issue_date || !item.institution_id) fail(`Neúplný dokument: ${JSON.stringify(item)}`);
    if (ids.has(item.id)) fail(`Duplicitní stabilní ID: ${item.id}`);
    ids.add(item.id);
    if (!institutionIds.has(item.institution_id)) missingInstitutions.push(`${item.id} → ${item.institution_id}`);

    for (const value of [item.public?.pdf, item.public?.html]) {
      if (typeof value === 'string' && value.startsWith('web/')) badPaths.push(`${item.id}: ${value}`);
    }
  }

  if (missingInstitutions.length) fail(`Dokumenty odkazují na neznámé instituce: ${missingInstitutions.join(', ')}`);
  if (badPaths.length) fail(`Veřejné cesty nesmějí začínat web/: ${badPaths.join(', ')}`);

  return { registry, axioms };
};

const validateLocalLinks = async html => {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  const missing = [];
  const invalidPdf = [];

  for (const href of new Set(hrefs)) {
    const clean = href.split('#')[0].split('?')[0];
    if (!clean || /^(?:https?:|mailto:|javascript:|data:)/i.test(clean)) continue;
    const normalized = normalizePublicPath(clean);
    if (!normalized) continue;
    const target = path.join(WEB, normalized);
    if (!(await exists(target))) {
      missing.push(clean);
      continue;
    }
    if (/\.pdf$/i.test(target)) {
      const bytes = await readFile(target);
      if (bytes.length < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') invalidPdf.push(clean);
    }
  }

  if (missing.length) fail(`Mrtvé lokální odkazy: ${missing.join(', ')}`);
  if (invalidPdf.length) fail(`Soubory odkazované jako PDF nemají platný PDF podpis: ${invalidPdf.join(', ')}`);
  return hrefs.length;
};

const validateOutput = async (registry, axioms) => {
  const home = await readFile(HOME, 'utf8');
  const article = await readFile(ARTICLE, 'utf8');

  for (const bar of REQUIRED_BARS) if (!home.includes(bar)) fail(`Na titulní stránce chybí lišta: ${bar}`);
  if (!article.includes(CORRECT_TITLE)) fail('Článek neobsahuje správný Godotův název');
  if (article.includes(WRONG_TITLE)) fail('Článek obsahuje chybný název s křižákem z Branibor');
  if (!article.includes('id="chronologie-seznam"')) fail('Článek neobsahuje sestavenou chronologii');
  if (/aktivní originály/i.test(article)) fail('Článek obsahuje zakázaný samostatný blok aktivních originálů');
  if (/href="web\//i.test(home + article)) fail('Ve veřejném HTML zůstal chybný prefix web/');

  const chronologyCount = (article.match(/<li id="doc-[^"]*"/g) || []).length;
  const expected = registry.documents.filter(item => item.issue_date >= '2026-05-01').length;
  if (chronologyCount !== expected) fail(`Chronologie má ${chronologyCount} položek, registr vyžaduje ${expected}`);

  const publicPdfItems = registry.documents.filter(item => item.public?.pdf);
  for (const item of publicPdfItems) {
    const relative = normalizePublicPath(item.public.pdf);
    if (!relative) continue;
    const target = path.join(WEB, relative);
    if (!(await exists(target))) fail(`Registr odkazuje na chybějící PDF: ${item.id} → ${relative}`);
    const bytes = await readFile(target);
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') fail(`Neplatný PDF soubor: ${item.id} → ${relative}`);
  }

  const linkCount = await validateLocalLinks(home + '\n' + article);
  const axiomText = axioms.axioms.map(item => item.text).join('\n');
  if (!/Dušan Dvořák/.test(axiomText) || !/Cannabis is The Cure/.test(axiomText)) fail('Axiomy nezachovávají pravidlo neanonymizace autora a organizace');
  if (!/iniciál/i.test(axiomText)) fail('Axiomy nezachovávají pravidlo iniciál jiných fyzických osob');

  return { chronologyCount, expected, linkCount, publicPdfCount: publicPdfItems.length };
};

await mkdir(path.join(WEB, 'data'), { recursive: true });
const { registry, axioms } = await validateRegistries();

// Jediný povolený pořádek sestavení. Workflow nesmí tyto moduly volat samostatně.
for (const script of [
  'scripts/build-dynamic-chronology.mjs',
  'scripts/ensure-msz-3-kzn-197-link.mjs',
  'scripts/finalize-homepage.mjs',
  'scripts/finalize-public-labels.mjs',
  'scripts/build-deadlines.mjs'
]) run(script);

const validation = await validateOutput(registry, axioms);
const manifest = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  canonical_document_registry: 'project-memory/documents-2026.json',
  auxiliary_registries: [
    'project-memory/institutions.json',
    'project-memory/publication-axioms.json',
    'project-memory/report-04082026-010-sources.json'
  ],
  build_entrypoint: 'scripts/build-site.mjs',
  validation,
  capabilities_preserved: {
    external_pdf_intake: 'draft-pr-7-pending-port',
    relevance_analysis: true,
    deadline_tracking: true,
    interactive_case_memory: true,
    legislation_and_case_law_registry: 'planned-canonical-auxiliary-registry',
    source_citations: true
  }
};
await writeFile(path.join(WEB, 'data', 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`[build-site] Hotový deterministický build: ${validation.chronologyCount} položek chronologie, ${validation.publicPdfCount} veřejných PDF, ${validation.linkCount} odkazů zkontrolováno.`);
