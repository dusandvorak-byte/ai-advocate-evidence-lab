import ast
import unittest
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/harden-public-pdf-privacy.py"
PIN = "expected-source"
REL = "documents/historical.pdf"

class HistoricalInspectionRetryTests(unittest.TestCase):
    def load(self, actual=PIN, result=None):
        tree = ast.parse(SOURCE.read_text("utf-8"))
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "retry_historical_inspection")
        ns = {"HISTORIC_INTERPELLATION_PRIMARY": REL, "HISTORIC_INTERPELLATION_SOURCE_SHA": PIN, "WEB": Path("/web"),
              "sha256_file": Mock(return_value=actual), "inspect_pdf_isolated": Mock(return_value=result or {"source_sha256": PIN, "reasons": []})}
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(SOURCE), "exec"), ns)
        return ns

    def test_failed_inspection_retried_serially(self):
        n = self.load()
        self.assertEqual(n["retry_historical_inspection"](REL, {"error": "timeout"}), {"source_sha256": PIN, "reasons": []})
        n["inspect_pdf_isolated"].assert_called_once_with(Path("/web") / REL, timeout=120)

    def test_physical_wrong_hash_fails_without_retry(self):
        n = self.load(actual="wrong")
        with self.assertRaisesRegex(RuntimeError, "physical input"):
            n["retry_historical_inspection"](REL, {"error": "timeout"})
        n["inspect_pdf_isolated"].assert_not_called()

    def test_second_inspection_failure_fails_closed(self):
        n = self.load(result={"error": "timeout"})
        with self.assertRaisesRegex(RuntimeError, "bounded serial retry"):
            n["retry_historical_inspection"](REL, {"error": "timeout"})

    def test_inspection_hash_mismatch_fails_closed(self):
        n = self.load(result={"source_sha256": "wrong"})
        with self.assertRaisesRegex(RuntimeError, "identity mismatch"):
            n["retry_historical_inspection"](REL, {"error": "timeout"})

    def test_clean_inspection_no_retry(self):
        n = self.load()
        data = {"source_sha256": PIN, "reasons": ["private_match"]}
        self.assertIs(n["retry_historical_inspection"](REL, data), data)
        n["inspect_pdf_isolated"].assert_not_called()

    def test_other_pdf_unchanged(self):
        n = self.load()
        data = {"error": "timeout"}
        self.assertIs(n["retry_historical_inspection"]("documents/other.pdf", data), data)
        n["sha256_file"].assert_not_called()
        n["inspect_pdf_isolated"].assert_not_called()

if __name__ == "__main__":
    unittest.main()
