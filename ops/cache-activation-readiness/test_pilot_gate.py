"""Exercise the actual trusted workflow's mode-selection shell block with synthetic evidence."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/trusted-pdf-shard-diagnostic.yml"
SHA = "a" * 40

class PilotGateTests(unittest.TestCase):
    def exercise(self, opt_in="1", fetch_ok=True, diagnostic_ok=True, **changes):
        row = dict(scope="shadow-cache-eligibility-diagnostic", source_sha=SHA,
                   audit_run_id=123, eligible=True, reuse_authorized=False,
                   fresh_final_audit_required=True, potential_hits=4,
                   exact_matches=4, mismatches=0, identity_mismatches=[])
        row.update(changes)
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            prior = root / "prior-transform-evidence/prior"
            prior.mkdir(parents=True)
            (prior / "run.json").write_text(json.dumps({"head_sha":SHA,"id":123}))
            stub = root / "python3"
            stub.write_text("""#!/bin/bash
case "$1" in
  scripts/fetch-pdf-transform-evidence.py) exit "$TEST_FETCH_EXIT" ;;
  ops/cache-activation-readiness/activation_readiness.py)
    [ "$TEST_DIAGNOSTIC_EXIT" = 0 ] || exit "$TEST_DIAGNOSTIC_EXIT"
    printf '%s\\n' "$TEST_READINESS"
    ;;
  *) exit 99 ;;
esac
""")
            stub.chmod(0o700)
            envfile = root / "env"
            env = dict(os.environ, PATH=str(root)+":"+os.environ["PATH"],
                       RUNNER_TEMP=d, GITHUB_ENV=str(envfile),
                       TEST_FETCH_EXIT="0" if fetch_ok else "1",
                       TEST_DIAGNOSTIC_EXIT="0" if diagnostic_ok else "1",
                       TEST_READINESS=json.dumps(row))
            env.pop("PDF_TRANSFORM_REUSE_OPT_IN", None)
            if opt_in is not None:
                env["PDF_TRANSFORM_REUSE_OPT_IN"] = opt_in
            # Extract the production shell block, not a duplicate implementation.
            text = WORKFLOW.read_text()
            block = text.split("      - name: Prepare optional transformation measurement or explicit reuse\n",1)[1]
            block = block.split("\n      - name: Materialize trusted public tree",1)[0]
            block = block.split("        run: |\n",1)[1]
            code = "\n".join(line[10:] for line in block.splitlines())
            subprocess.run(["bash","-c",code], env=env, check=True, capture_output=True, text=True)
            modes = [x for x in envfile.read_text().splitlines() if x.startswith("EVIDENCE_LAB_PDF_TRANSFORM_MODE=")]
            self.assertEqual(len(modes),1)
            return modes[0].split("=")[1]
    def test_exact_opt_in(self):
        self.assertEqual(self.exercise(),"reuse")
    def test_default_shadow(self):
        self.assertEqual(self.exercise(opt_in=""),"shadow")
    def test_cold_cache(self):
        self.assertEqual(self.exercise(fetch_ok=False),"shadow")
    def test_diagnostic_failure(self):
        self.assertEqual(self.exercise(diagnostic_ok=False),"shadow")
    def test_mismatch(self):
        self.assertEqual(self.exercise(mismatches=1,exact_matches=3),"shadow")
    def test_wrong_run(self):
        self.assertEqual(self.exercise(audit_run_id=124),"shadow")
    def test_no_hits(self):
        self.assertEqual(self.exercise(potential_hits=0,exact_matches=0),"shadow")
    def test_no_final_audit(self):
        self.assertEqual(self.exercise(fresh_final_audit_required=False),"shadow")

if __name__ == "__main__":
    unittest.main()
