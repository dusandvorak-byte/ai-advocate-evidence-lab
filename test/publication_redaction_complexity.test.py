import re
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

    def test_unbalanced_binary_prefix_does_not_hide_later_hex_string(self):
        raw = b"(" * 64 + b"\n<736563726574>"
        payloads = redaction._pdf_decoded_string_payloads(raw)
        self.assertIn(b"secret", payloads)

    def test_unbalanced_binary_prefix_does_not_hide_later_octal_string(self):
        raw = b"(" * 64 + b"\n(\\163\\145\\143\\162\\145\\164)"
        payloads = redaction._pdf_decoded_string_payloads(raw)
        self.assertTrue(any(b"secret" in payload for payload in payloads))

    def test_unbalanced_binary_prefix_does_not_hide_later_utf16_string(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"(" * 64 + b"\n(" + secret + b")"
        payloads = redaction._pdf_decoded_string_payloads(raw)
        self.assertIn(secret, payloads)
        hits = redaction.forbidden_public_identifier_byte_hits(
            raw,
            (("private_raw_match_1", re.compile("secret")),),
        )
        self.assertEqual(hits, ["private_raw_match_1"])

    def test_top_level_backslash_does_not_escape_literal_opener(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"X\\(" + secret + b")"
        hits = redaction.forbidden_public_identifier_byte_hits(
            raw,
            (("private_raw_match_1", re.compile("secret")),),
        )
        self.assertEqual(hits, ["private_raw_match_1"])

    def test_malformed_outer_literal_cannot_escape_recovery_opener(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"(" * 64 + b"X\\(" + secret + b")"
        hits = redaction.forbidden_public_identifier_byte_hits(
            raw,
            (("private_raw_match_1", re.compile("secret")),),
        )
        self.assertEqual(hits, ["private_raw_match_1"])

    def test_unmatched_literal_stack_is_bounded_fail_closed(self):
        limit = redaction.MAX_PDF_LITERAL_STACK_DEPTH
        raw = b"(" * (limit + 1)
        with self.assertRaises(redaction.RedactionPolicyError):
            redaction._pdf_decoded_string_payloads(raw)

    def test_escape_recovery_does_not_retain_a_full_file_candidate(self):
        raw = (b"binary-prefix-\\163-" * 4096) + b"tail"
        payloads = redaction._pdf_decoded_string_payloads(raw)
        self.assertEqual(payloads, [])


if __name__ == "__main__":
    unittest.main()
