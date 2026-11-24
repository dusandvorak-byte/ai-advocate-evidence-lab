"""Regression for event-bound SHA wiring of both trusted audit workflows."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATE = ROOT / ".github/workflows/validate-evidence-lab-2.yml"
SHARD = ROOT / ".github/workflows/trusted-pdf-shard-diagnostic.yml"


def audit_bindings(path):
    text = path.read_text(encoding="utf-8")
    # Require the env block on the same audit-assembler step (not an unrelated job).
    blocks = re.findall(
        r"      - name: (?:Assemble sliced release evidence audit|Verify all fragments are present and assemble)\n"
        r"(?P<body>(?:(?!      - name:).|\n)*?)\n      - name:",
        text + "\n      - name: _END_",
    )
    if len(blocks) != 1:
        raise AssertionError(f"expected exactly one trusted assembler step in {path}: got {len(blocks)}")
    return blocks[0]


def binding_value(block, name):
    match = re.search(r"^          " + name + r": ([^\n]+)$", block, re.M)
    return match.group(1).strip() if match else None


class GitHubEventBindingsTests(unittest.TestCase):
    def test_trusted_full_validation_uses_pr_base_or_push_before(self):
        block = audit_bindings(VALIDATE)
        self.assertEqual(
            binding_value(block, "EXPECTED_BASE_SHA"),
            "${{ github.event.pull_request.base.sha || github.event.before }}",
        )
        self.assertEqual(
            binding_value(block, "EXPECTED_HEAD_SHA"),
            "${{ github.event.pull_request.head.sha || github.sha }}",
        )

    def test_trusted_shard_uses_immutable_push_before(self):
        block = audit_bindings(SHARD)
        self.assertEqual(binding_value(block, "EXPECTED_BASE_SHA"), "${{ github.event.before }}")
        self.assertEqual(binding_value(block, "EXPECTED_HEAD_SHA"), "${{ github.sha }}")

    def test_trusted_assemblers_execute_fail_closed_script(self):
        for workflow in (VALIDATE, SHARD):
            block = audit_bindings(workflow)
            self.assertIn("python3 scripts/audit-release-evidence-sliced.py assemble", block)
            self.assertNotIn("EXPECTED_BASE_SHA: ${{ github.event.pull_request.base.sha }}", block)


if __name__ == "__main__":
    unittest.main()
