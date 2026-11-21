import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import publication_redaction as redaction


class PublicationRedactionComplexityTests(unittest.TestCase):
    def test_unbalanced_literal_bytes_are_processed_in_linear_time(self):
        # Uncompressed QDF streams may contain arbitrary binary '(' bytes. The
        # parser must not restart a full tail scan at every unmatched byte.
        raw = b"(" * 8000
        started = time.perf_counter()
        payloads = redaction._pdf_decoded_string_payloads(raw)
        elapsed = time.perf_counter() - started

        self.assertEqual(payloads, [])
        self.assertLess(
            elapsed,
            1.0,
            f"unbalanced literal scan took {elapsed:.3f}s; expected linear-time behavior",
        )


if __name__ == "__main__":
    unittest.main()
