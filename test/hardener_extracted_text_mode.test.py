import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HARDENER = ROOT / "scripts/harden-public-pdf-privacy.py"


class HardenerExtractedTextModeTests(unittest.TestCase):
    def test_pdftotext_call_sites_disable_pdf_literal_parsing(self):
        tree = ast.parse(HARDENER.read_text("utf-8"))
        calls = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if not isinstance(node.func, ast.Name):
                continue
            if node.func.id != "forbidden_public_identifier_byte_hits":
                continue
            if not node.args or not isinstance(node.args[0], ast.Name):
                continue
            if node.args[0].id == "text_bytes":
                calls.append(node)

        self.assertTrue(calls, "expected the shared pdftotext scan")
        for call in calls:
            keyword = next(
                (item for item in call.keywords if item.arg == "scan_pdf_strings"),
                None,
            )
            self.assertIsNotNone(keyword, "pdftotext bytes must opt out of PDF literal parsing")
            self.assertIsInstance(keyword.value, ast.Constant)
            self.assertIs(keyword.value.value, False)


if __name__ == "__main__":
    unittest.main()
