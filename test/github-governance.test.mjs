import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const [
  intake,
  prTemplate,
  codeowners,
  dependabot,
  ci,
  codeql,
  pages,
  release,
  sourceHealth,
  security
] = await Promise.all([
  readFile('.github/ISSUE_TEMPLATE/document-intake.yml', 'utf8'),
  readFile('.github/PULL_REQUEST_TEMPLATE.md', 'utf8'),
  readFile('.github/CODEOWNERS', 'utf8'),
  readFile('.github/dependabot.yml', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
  readFile('.github/workflows/codeql.yml', 'utf8'),
  readFile('.github/workflows/pages.yml', 'utf8'),
  readFile('.github/workflows/publication-release.yml', 'utf8'),
  readFile('.github/workflows/source-health.yml', 'utf8'),
  readFile('SECURITY.md', 'utf8')
]);

assert.match(intake, /repozitář jsou veřejné/i);
assert.match(intake, /anonymizaci/);
assert.match(intake, /postoupení, prověřování ani dohled samy nepotvrzují protiprávnost/);
assert.match(prTemplate, /Každé nové faktické tvrzení má přesný veřejný zdroj nebo doslovnou citaci/);
assert.match(prTemplate, /zvýšenou verzi/);
assert.match(codeowners, /web\/documents/);
assert.match(dependabot, /package-ecosystem:\s*github-actions/);
assert.match(ci, /pull_request:/);
assert.match(ci, /permissions:\s*\n\s*contents:\s*read/);
assert.match(codeql, /github\/codeql-action\/init@v4/);
assert.match(codeql, /security-events:\s*write/);
assert.match(pages, /path:\s*web/);
assert.match(release, /workflow_dispatch:/);
assert.match(release, /prepare-publication-release\.mjs/);
assert.match(sourceHealth, /check-public-sources\.mjs --network/);
assert.match(sourceHealth, /issues:\s*write/);
assert.match(security, /nehlaste do veřejného issue/i);

const workflowNames = await readdir('.github/workflows');
for (const workflowName of workflowNames) {
  const workflow = await readFile(`.github/workflows/${workflowName}`, 'utf8');
  assert.doesNotMatch(workflow, /pull_request_target\s*:/, `${workflowName} must not run privileged code from pull_request_target`);
  assert.doesNotMatch(workflow, /\$\{\{\s*github\.event\.(?:issue|pull_request)\.(?:title|body)/, `${workflowName} must not interpolate untrusted issue or PR text into shell`);
}

console.log(`GitHub governance: ${workflowNames.length} workflows and safety controls passed`);
