"""Exercise the actual release polling block with a fake GitHub CLI; no secrets or network."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/publish-gh-pages-branch.yml"


def polling_script():
    source = WORKFLOW.read_text(encoding="utf-8")
    step = source.split("      - name: Počkat na autoritativní exact-SHA shard audit\n", 1)[1]
    step = step.split("\n      - name:", 1)[0]
    script = textwrap.dedent(step.split("        run: |\n", 1)[1])
    # Shorten only the waiting interval and timeout in the isolated test.
    assert "SECONDS + 5100" in script and "sleep 10" in script
    return script.replace("SECONDS + 5100", "SECONDS + 1").replace("sleep 10", "sleep 1")


class PollTests(unittest.TestCase):
    def check_candidate(self, candidate, succeeds=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            gh = root / "gh"
            gh.write_text('#!/bin/bash\nprintf "%s" "$CANDIDATE"\n', encoding="utf-8")
            gh.chmod(0o755)
            target = root / "env"
            env = dict(os.environ, PATH=f'{tmp}:{os.environ["PATH"]}',
                       AUDIT_TARGET_SHA="a" * 40, GITHUB_ENV=str(target),
                       CANDIDATE=json.dumps(candidate))
            result = subprocess.run(["bash", "-c", polling_script()], env=env,
                                    capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode == 0, succeeds, result.stderr)
            self.assertEqual(target.read_text() if target.exists() else "",
                             "DIAGNOSTIC_RUN_ID=123\n" if succeeds else "")

    def candidate(self, status="completed", conclusion="success", sha="a" * 40, run_id=123):
        return dict(databaseId=run_id, status=status, conclusion=conclusion, headSha=sha)

    def test_success(self):
        self.check_candidate(self.candidate(), True)

    def test_failure(self):
        self.check_candidate(self.candidate(conclusion="failure"))

    def test_cancelled(self):
        self.check_candidate(self.candidate(conclusion="cancelled"))

    def test_pending_timeout(self):
        self.check_candidate(self.candidate(status="in_progress", conclusion=None))

    def test_no_run(self):
        self.check_candidate(None)

    def test_wrong_sha(self):
        self.check_candidate(self.candidate(sha="b" * 40))

    def test_bad_id(self):
        self.check_candidate(self.candidate(run_id="null"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
