import unittest
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit_git_lineage import check_lineage

BASE = "a" * 40
HEAD = "b" * 40
LATER = "c" * 40
DIVERGED = "d" * 40


def git_graph(ancestors, bases):
    def run(cmd):
        if cmd[:3] == ["git", "merge-base", "--is-ancestor"]:
            return SimpleNamespace(returncode=0 if (cmd[3], cmd[4]) in ancestors else 1, stdout="")
        if cmd[:2] == ["git", "merge-base"]:
            base = bases.get((cmd[2], cmd[3]))
            return SimpleNamespace(returncode=0 if base else 1, stdout=(base or "") + "\n")
        raise AssertionError(cmd)
    return run


class ImmutableAuditBaseTests(unittest.TestCase):
    def setUp(self):
        self.run = git_graph({(BASE, HEAD), (HEAD, LATER), (HEAD, HEAD)}, {(BASE, HEAD): BASE, (HEAD, HEAD): HEAD})

    def verify(self, *, checkout=HEAD, expected_head=HEAD, expected_base=BASE,
               remote_main=LATER, github_actions=True, run=None):
        return check_lineage(
            checkout=checkout, expected_head=expected_head,
            expected_base=expected_base, remote_main=remote_main,
            github_actions=github_actions, run=run or self.run
        )

    def test_remote_main_can_advance_to_descendant_during_audit(self):
        base, source, ancestor, merge_base, failures = self.verify()
        self.assertEqual((base, source, ancestor, merge_base, failures),
                         (BASE, "workflow_event", True, BASE, []))

    def test_remote_main_is_not_silently_substituted_for_missing_event_base(self):
        base, source, ancestor, merge_base, failures = self.verify(expected_base="")
        self.assertFalse(ancestor)
        self.assertIn("EXPECTED_BASE_SHA missing from immutable GitHub event", failures)
        self.assertNotEqual(base, LATER)

    def test_missing_event_head_is_not_accepted_as_matching(self):
        self.assertIn("checkout SHA", " ".join(self.verify(expected_head=BASE)[-1]))

    def test_divergent_remote_branch_is_blocked(self):
        failures = self.verify(remote_main=DIVERGED)[-1]
        self.assertTrue(any("diverged" in f for f in failures))

    def test_wrong_event_base_is_blocked(self):
        failures = self.verify(expected_base=LATER)[-1]
        self.assertTrue(any("not an ancestor" in f for f in failures))
        self.assertTrue(any("merge-base mismatch" in f for f in failures))

    def test_identical_checkout_and_remote_is_valid(self):
        self.assertEqual(self.verify(remote_main=HEAD)[-1], [])

    def test_missing_remote_main_is_blocked(self):
        self.assertIn("cannot verify current remote main SHA", self.verify(remote_main=None)[-1])


if __name__ == "__main__":
    unittest.main()
