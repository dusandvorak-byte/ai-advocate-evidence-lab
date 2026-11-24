"""Regression for immutable push lineage and single trusted artifact handoff."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github/workflows"
VALIDATE = WORKFLOWS / "validate-evidence-lab-2.yml"
SHARD = WORKFLOWS / "trusted-pdf-shard-diagnostic.yml"
PUBLISH = WORKFLOWS / "publish-gh-pages-branch.yml"


def read(path):
    return path.read_text(encoding="utf-8")


def step(text, name):
    start = "      - name: " + name + "\n"
    assert text.count(start) == 1, name
    return text.split(start, 1)[1].split("\n      - name:", 1)[0]


class GitHubEventBindingsTests(unittest.TestCase):
    def test_single_assembler_uses_immutable_event_before(self):
        text = read(SHARD)
        block = step(text, "Verify all fragments are present and assemble")
        self.assertIn("EXPECTED_BASE_SHA: " + "$" + "{{ github.event.before }}", block)
        self.assertIn("EXPECTED_HEAD_SHA: " + "$" + "{{ github.sha }}", block)
        self.assertIn("python3 scripts/audit-release-evidence-sliced.py assemble 16", block)
        self.assertEqual(text.count("python3 scripts/audit-release-evidence-sliced.py assemble"), 1)
        self.assertNotIn("scripts/audit-release-evidence-sliced.py assemble", read(VALIDATE))

    def test_single_authoritative_build_and_contracts(self):
        source = read(SHARD)
        legacy = read(VALIDATE)
        self.assertEqual(source.count("node scripts/build-site.mjs"), 1)
        self.assertNotIn("node scripts/build-site.mjs", legacy)
        self.assertLess(source.index("bash scripts/validate-final-web-contracts.sh"),
                        source.index("name: Upload prepared public tree and hardening report"))
        self.assertIn('data.get("revision_token") != "2026-11-17-v1"', source)
        self.assertIn("EVIDENCE_LAB_CANONICAL_PROVENANCE_CONTRACT_SHA256", source)

    def test_read_only_handoff_is_identical_to_publication_gate(self):
        names = ["Určit trusted preflight vs explicitně autorizovanou publikaci",
                 "Počkat na autoritativní exact-SHA shard audit",
                 "Stáhnout a kryptograficky svázat auditovaný release tree"]
        legacy, publish = read(VALIDATE), read(PUBLISH)
        for name in names:
            self.assertEqual(step(legacy, name).strip(), step(publish, name).strip())
        self.assertIn("actions: read", legacy)
        self.assertNotIn("contents: write", legacy)
        self.assertNotIn("git push", legacy)

    def test_authorization_only_uses_parent_audit(self):
        source = read(SHARD)
        self.assertIn("paths-ignore:\n      - '.release/evidence-lab-publication-authorization.json'", source)
        target = step(read(VALIDATE), "Určit trusted preflight vs explicitně autorizovanou publikaci")
        self.assertIn('audit_target="$GITHUB_SHA"', target)
        self.assertIn('audit_target="$PREVIOUS_SHA"', target)
        self.assertIn('test "$parent" = "$PREVIOUS_SHA"', target)
        self.assertIn('if target != previous:', target)

    def test_handoff_requires_success_and_checks_artifact(self):
        text = read(VALIDATE)
        poll = step(text, "Počkat na autoritativní exact-SHA shard audit")
        self.assertIn('test "$conclusion" = "success"', poll)
        self.assertIn('[ -z "$successful_run_id" ]', poll)
        self.assertIn('[ "$candidate_sha" != "$AUDIT_TARGET_SHA" ]', poll)
        artifact = step(text, "Stáhnout a kryptograficky svázat auditovaný release tree")
        self.assertIn('report.get("checkout_commit") != expected', artifact)
        self.assertIn('summary.get("hard_failure_count") != 0', artifact)
        self.assertIn('recon.get("staged_set_exact_match") is not True', artifact)
        self.assertIn('recon.get("id69_absent_from_final_release_state") is not True', artifact)
        self.assertIn('validate-staged-legacy-pdf-provenance.py', artifact)
        self.assertIn('release-cache-version.mjs --verify', artifact)


if __name__ == "__main__":
    unittest.main(verbosity=2)
