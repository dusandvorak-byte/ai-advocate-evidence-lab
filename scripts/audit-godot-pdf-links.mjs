import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const articlePath = 'web/zpravy/04082026-010.html';
const registryPath = 'project-memory/documents-2026.json';
const institutionsPath = 'project-memory/institutions.json';
const reportPath = 'web/data/godot-pdf-audit.json';
const allowedInstitutionTypes = new Set(['ministry', 'executive_office', 'prosecution', 'police', 'police_lab']);
const publicPath = value => String(value || '').replace(/^\.\//, '').replace(/^\/+/, '').replace(/^web\//, '');
const exists = file => access(file).then(() => true).catch(() => false);

async function usablePdf(file) {
  if (!await exists(file)) return false;
  const info = await stat(file);
  if (!info.isFile() || info.size < 1024) return false;
  const data = await readFile(file);
  if (data.subarray(0, 5).toString() !== '%PDF-') return false;
  return data.subarray(Math.max(0, data.length - 2048)).toString('latin1').includes('%%EOF');
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full.replaceAll('\\', '/'));
  }
  return out;
}

const article = await readFile(articlePath, 'utf8');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const institutions = JSON.parse(await readFile(institutionsPath, 'utf8'));
const institutionMap = new Map(institutions.institutions.map(item => [item.id, item]));

const hrefs = [...article.matchAll(/href=["']([^"']+\.pdf(?:#[^"']*)?)["']/gi)].map(match => match[1].split('#')[0]);
const articlePdfLinks = [...new Set(hrefs)];
const brokenArticlePdfLinks = [];
for (const href of articlePdfLinks) {
  if (/^https?:/i.test(href)) continue;
  const file = `web/${publicPath(href)}`;
  if (!await usablePdf(file)) brokenArticlePdfLinks.push({ href, file });
}

const eligible = registry.documents.filter(doc => allowedInstitutionTypes.has(institutionMap.get(doc.institution_id)?.type));
const eligibleWithActivePdf = eligible.filter(doc => Boolean(doc.public?.pdf));
const eligibleWithoutActivePdf = eligible.filter(doc => !doc.public?.pdf).map(doc => ({
  id: doc.id,
  institution_id: doc.institution_id,
  institution: institutionMap.get(doc.institution_id)?.name || doc.institution_id,
  issue_date: doc.issue_date,
  reference: doc.reference,
  title: doc.user_title
}));
const invalidRegistryPdfLinks = [];
for (const doc of eligibleWithActivePdf) {
  const file = `web/${publicPath(doc.public.pdf)}`;
  if (!await usablePdf(file)) invalidRegistryPdfLinks.push({ id: doc.id, pdf: doc.public.pdf, file });
}

const repoPdfFiles = (await walk('.')).filter(file => /\.pdf$/i.test(file));
const usableRepoPdfs = [];
for (const file of repoPdfFiles) if (await usablePdf(file)) usableRepoPdfs.push(file.replace(/^\.\//, ''));
const usablePublicPdfs = usableRepoPdfs.filter(file => file.startsWith('web/documents/'));
const usablePdfOutsidePublicTree = usableRepoPdfs.filter(file => !file.startsWith('web/documents/'));

const report = {
  generated_at: new Date().toISOString(),
  article: articlePath,
  article_pdf_link_count: articlePdfLinks.length,
  broken_article_pdf_link_count: brokenArticlePdfLinks.length,
  broken_article_pdf_links: brokenArticlePdfLinks,
  eligible_institution_document_count: eligible.length,
  eligible_with_active_pdf_count: eligibleWithActivePdf.length,
  eligible_without_active_pdf_count: eligibleWithoutActivePdf.length,
  eligible_without_active_pdf: eligibleWithoutActivePdf,
  invalid_registry_pdf_link_count: invalidRegistryPdfLinks.length,
  invalid_registry_pdf_links: invalidRegistryPdfLinks,
  repository_pdf_count: repoPdfFiles.length,
  usable_repository_pdf_count: usableRepoPdfs.length,
  usable_public_pdf_count: usablePublicPdfs.length,
  usable_pdf_outside_public_tree_count: usablePdfOutsidePublicTree.length,
  usable_pdf_outside_public_tree: usablePdfOutsidePublicTree
};
await mkdir('web/data', { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (brokenArticlePdfLinks.length || invalidRegistryPdfLinks.length) {
  throw new Error(`Godot PDF audit selhal: ${brokenArticlePdfLinks.length} nefunkčních PDF odkazů v článku, ${invalidRegistryPdfLinks.length} neplatných registrovaných PDF vazeb.`);
}
console.log(`Godot PDF audit: ${articlePdfLinks.length} PDF odkazů v článku, 0 nefunkčních; ${eligibleWithActivePdf.length}/${eligible.length} listin policie/SZ/KPR/ministerstev má aktivní PDF; ${usablePdfOutsidePublicTree.length} použitelných PDF leží mimo web/documents.`);
