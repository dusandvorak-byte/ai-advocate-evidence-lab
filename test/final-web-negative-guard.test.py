"""Exercise the actual negative-content guard without running the full build."""
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/validate-final-web-contracts.sh"


class FinalWebNegativeGuardTests(unittest.TestCase):
    def run_guard(self, text):
        source = SCRIPT.read_text(encoding="utf-8")
        start = source.index("require_pattern_absent() {")
        end = source.index("\n}\n", start) + len("\n}\n")
        guard = source[start:end]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "web.html"
            if text is not None:
                path.write_text(text, encoding="utf-8")
            return subprocess.run(
                ["bash", "-euo", "pipefail", "-c",
                 guard + '\nrequire_pattern_absent "forbidden" "$1"\nprintf "passed\\n"',
                 "_", str(path)], capture_output=True, text=True, timeout=5)

    def test_clean_passes(self):
        result = self.run_guard("ordinary public text")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "passed\n")

    def test_forbidden_fails_case_insensitively(self):
        result = self.run_guard("includes FORBIDDEN text")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("passed", result.stdout)

    def test_missing_file_fails(self):
        result = self.run_guard(None)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("passed", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
