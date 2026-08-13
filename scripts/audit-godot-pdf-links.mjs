import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const articlePath = 'web/zpravy/04082026-010.html';
const registryPath = 'project-memory/documents-2026.json';
const institutionsPath = 'project-memory/institutions.json';
const reportPath = 'web/data/godot-pdf-audit.json';
const allowedInstitutionTypes = new Set([
  'ministry','executive_office','prosecution','police','police_lab','court','court_enforcement',
  'public_institution','independent_authority','eu_agency','executive'
]);
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
  title: doc.user_title,
  intended_pdf: doc.public?.intended_pdf || null
}));
const invalidRegistryPdfLinks = [];
for (const doc of eligibleWithActivePdf) {
  const file = `web/${publicPath(doc.public.pdf)}`;
  if (!await usablePdf(file)) invalidRegistryPdfLinks.push({ id: doc.id, pdf: doc.public.pdf, file });
}

// Reakce jsou invariant: každé kanonické outgoing podání s relací reakce_na musí být vykresleno
// uvnitř cílové státní položky. Má-li reakce fyzické public.pdf, Godot musí obsahovat právě tento aktivní PDF odkaz.
const reactionDocuments = registry.documents.filter(doc =>
  doc.submission_side === 'outgoing_from_user_or_alliance' &&
  Array.isArray(doc.relations) && doc.relations.some(rel => rel.type === 'reakce_na' && (rel.target_id || rel.target))
);
const missingRenderedReactions = [];
const missingReactionPdfLinks = [];
for (const reaction of reactionDocuments) {
  const rel = reaction.relations.find(item => item.type === 'reakce_na' && (item.target_id || item.target));
  const targetId = rel.target_id || rel.target;
  const targetMarker = `id="${targetId}"`;
  const targetStart = article.indexOf(targetMarker);
  if (targetStart < 0) {
    missingRenderedReactions.push({ reaction_id: reaction.id, target_id: targetId, reason: 'target-not-rendered' });
    continue;
  }
  const targetEnd = article.indexOf('</li>', targetStart);
  if (targetEnd < 0) {
    missingRenderedReactions.push({ reaction_id: reaction.id, target_id: targetId, reason: 'target-li-not-closed' });
    continue;
  }
  const targetHtml = article.slice(targetStart, targetEnd);
  const evidenceTokens = [reaction.user_title, reaction.reference].filter(Boolean);
  const hasReactionSignal = targetHtml.includes('chronology-reaction') && evidenceTokens.some(token => targetHtml.includes(String(token).slice(0, Math.min(40, String(token).length))));
  if (!hasReactionSignal) missingRenderedReactions.push({ reaction_id: reaction.id, target_id: targetId, reason: 'reaction-not-inline' });
  if (reaction.public?.pdf) {
    const pdf = publicPath(reaction.public.pdf);
    if (!targetHtml.includes(`href="${pdf}"`) && !targetHtml.includes(`href='${pdf}'`)) {
      missingReactionPdfLinks.push({ reaction_id: reaction.id, target_id: targetId, expected_pdf: pdf });
    }
  }
}

const repoPdfFiles = (await walk('.')).filter(file => /\.pdf$/i.test(file));
const usableRepoPdfs = [];
for (const file of repoPdfFiles) if (await usablePdf(file)) usableRepoPdfs.push(file.replace(/^\.\//, ''));
const usablePublicPdfs = usableRepoPdfs.filter(file => file.startsWith('web/documents/'));
const usablePdfOutsidePublicTree = usableRepoPdfs.filter(file => !file.startsWith('web/documents/'));

const report = {
  generated_at: new Date().toISOString(),
  article: articlePath,
  active_pdf_scope: [...allowedInstitutionTypes],
  article_pdf_link_count: articlePdfLinks.length,
  broken_article_pdf_link_count: brokenArticlePdfLinks.length,
  broken_article_pdf_links: brokenArticlePdfLinks,
  eligible_institution_document_count: eligible.length,
  eligible_with_active_pdf_count: eligibleWithActivePdf.length,
  eligible_without_active_pdf_count: eligibleWithoutActivePdf.length,
  eligible_without_active_pdf: eligibleWithoutActivePdf,
  invalid_registry_pdf_link_count: invalidRegistryPdfLinks.length,
  invalid_registry_pdf_links: invalidRegistryPdfLinks,
  reaction_document_count: reactionDocuments.length,
  missing_rendered_reaction_count: missingRenderedReactions.length,
  missing_rendered_reactions: missingRenderedReactions,
  missing_reaction_pdf_link_count: missingReactionPdfLinks.length,
  missing_reaction_pdf_links: missingReactionPdfLinks,
  repository_pdf_count: repoPdfFiles.length,
  usable_repository_pdf_count: usableRepoPdfs.length,
  usable_public_pdf_count: usablePublicPdfs.length,
  usable_pdf_outside_public_tree_count: usablePdfOutsidePublicTree.length,
  usable_pdf_outside_public_tree: usablePdfOutsidePublicTree
};
await mkdir('web/data', { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (brokenArticlePdfLinks.length || invalidRegistryPdfLinks.length || missingRenderedReactions.length || missingReactionPdfLinks.length) {
  throw new Error(`Godot audit selhal: ${brokenArticlePdfLinks.length} nefunkčních PDF, ${invalidRegistryPdfLinks.length} neplatných registrovaných PDF, ${missingRenderedReactions.length} chybějících inline reakcí, ${missingReactionPdfLinks.length} reakcí bez aktivního PDF odkazu.`);
}
console.log(`Godot audit: ${articlePdfLinks.length} aktivních PDF odkazů; ${eligibleWithActivePdf.length}/${eligible.length} oprávněných institucionálních listin má PDF; ${reactionDocuments.length}/${reactionDocuments.length} kanonických reakcí vykresleno inline; 0 chybějících aktivních reaction PDF.`);
