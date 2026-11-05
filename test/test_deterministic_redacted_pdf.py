"""Synthetic-only regression: same source/scans => identical PDF bytes.

Extract the append_scans function from the production script without executing
the script's top-level real-document materialization or registry writes.
Never opens any original legal PDF or scan.
"""
import ast
import hashlib
import tempfile
import unittest
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/materialize-redacted-originals-2026-10-16.py"


def tested_function(root, scan_paths):
    source = ast.parse(SOURCE.read_text(encoding="utf-8"))
    fn = next(
        node for node in source.body
        if isinstance(node, ast.FunctionDef) and node.name == "append_scans"
    )
    module = ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[]))
    scans = []
    for path in scan_paths:
        data = (root / path).read_bytes()
        scans.append((path, hashlib.sha256(data).hexdigest()))
    context = {
        "fitz": fitz,
        "ROOT": root,
        "SCAN_SPECS": scans,
        "sha": lambda b: hashlib.sha256(b).hexdigest(),
    }
    exec(compile(module, str(SOURCE), "exec"), context)
    return context["append_scans"]


class DeterministicRedactedPdf(unittest.TestCase):
    def test_two_independent_generations_have_identical_bytes_and_pages(self):
        with tempfile.TemporaryDirectory(prefix="synthetic-pdf-id-") as temp:
            root = Path(temp)
            (root / "project-memory").mkdir()
            paths = ["scan1.jpg", "scan2.jpg"]
            for i, filename in enumerate(paths):
                Image.new("RGB", (120, 90), color=(100 + i, 80, 60)).save(
                    root / filename, format="JPEG", quality=90
                )
            source = fitz.open()
            source.new_page(width=595.276, height=841.89).insert_text(
                (72, 72), "SYNTHETIC REGRESSION ONLY"
            )
            source.set_metadata({"title": "Synthetic input"})
            raw = source.tobytes(garbage=4, deflate=True)
            source.close()
            run = tested_function(root, paths)
            first = run(raw)
            second = run(raw)
            self.assertEqual(first, second, "Identical inputs changed PDF SHA-256")
            self.assertEqual(
                hashlib.sha256(first).hexdigest(),
                hashlib.sha256(second).hexdigest()
            )
            with fitz.open(stream=first, filetype="pdf") as pdf:
                self.assertEqual(len(pdf), 3)
                self.assertIn("SYNTHETIC REGRESSION ONLY", pdf[0].get_text())
                self.assertEqual(pdf.metadata["title"],
                    "Žádost policii 15. 10. 2026 - redigovaný originál + historická příloha 11. 8. 2014")
                for page in (pdf[1], pdf[2]):
                    self.assertEqual(len(page.get_images(full=True)), 1)
            self.assertFalse((root / "project-memory" /
                ".tmp-police-redacted-original-with-2014.pdf").exists())


if __name__ == "__main__":
    unittest.main()
