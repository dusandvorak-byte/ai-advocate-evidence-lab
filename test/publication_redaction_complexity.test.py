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
        raw = b"(" * 8000
        started = time.perf_counter()
        payloads = redaction._pdf_decoded_string_payloads(raw)
        elapsed = time.perf_counter() - started
        self.assertEqual(payloads, [])
        self.assertLess(elapsed, 1.0, f"unbalanced literal scan took {elapsed:.3f}s")

    def test_raw_utf16_identifier_is_detected_at_both_byte_alignments(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        matcher = (("m", re.compile("secret")),)
        self.assertEqual(redaction.forbidden_public_identifier_byte_hits(secret, matcher), ["m"])
        self.assertEqual(redaction.forbidden_public_identifier_byte_hits(b"X" + secret, matcher), ["m"])

    def test_extracted_text_skips_pdf_literal_payload_parsing(self):
        raw = (b"(" * 1600) + b" secret " + (b")" * 1600)
        matcher = (("m", re.compile("secret")),)
        started = time.perf_counter()
        hits = redaction.forbidden_public_identifier_byte_hits(
            raw,
            matcher,
            scan_pdf_strings=False,
        )
        elapsed = time.perf_counter() - started
        self.assertEqual(hits, ["m"])
        self.assertLess(elapsed, 1.0, f"extracted text scan took {elapsed:.3f}s")

    def test_unbalanced_binary_prefix_does_not_hide_later_hex_string(self):
        raw = b"(" * 64 + b"\n<736563726574>"
        self.assertIn(b"secret", redaction._pdf_decoded_string_payloads(raw))

    def test_unbalanced_binary_prefix_does_not_hide_later_octal_string(self):
        raw = b"(" * 64 + b"\n(\\163\\145\\143\\162\\145\\164)"
        self.assertTrue(any(b"secret" in p for p in redaction._pdf_decoded_string_payloads(raw)))

    def test_unbalanced_binary_prefix_does_not_hide_later_utf16_string(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"(" * 64 + b"\n(" + secret + b")"
        self.assertIn(secret, redaction._pdf_decoded_string_payloads(raw))
        self.assertEqual(redaction.forbidden_public_identifier_byte_hits(raw, (("m", re.compile("secret")),)), ["m"])

    def test_top_level_backslash_does_not_escape_literal_opener(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"X\\(" + secret + b")"
        self.assertEqual(redaction.forbidden_public_identifier_byte_hits(raw, (("m", re.compile("secret")),)), ["m"])

    def test_malformed_outer_literal_cannot_hide_utf16_identifier(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"(" * 64 + b"X\\(" + secret + b")"
        self.assertEqual(redaction.forbidden_public_identifier_byte_hits(raw, (("m", re.compile("secret")),)), ["m"])

    def test_escaped_closer_does_not_hide_utf16_identifier(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"Z(X\\(\\)" + secret + b")"
        self.assertEqual(redaction.forbidden_public_identifier_byte_hits(raw, (("m", re.compile("secret")),)), ["m"])

    def test_escaped_pair_around_utf16_identifier_is_detected(self):
        secret = b"\xfe\xff" + "secret".encode("utf-16-be")
        raw = b"ZZ(\\(" + secret + b"\\))"
        self.assertEqual(redaction.forbidden_public_identifier_byte_hits(raw, (("m", re.compile("secret")),)), ["m"])

    def test_repeated_shallow_literals_do_not_accumulate_recovery_state(self):
        count = redaction.MAX_PDF_LITERAL_STACK_DEPTH + 1
        raw = b"(x\\()" * count
        self.assertEqual(sum(1 for _ in redaction._iter_pdf_decoded_string_payloads(raw)), count)

    def test_overlapping_nested_escape_scans_fail_closed_before_superlinear_work(self):
        depth = 320
        continuation_region = b"\\\n" * 2048
        raw = b"(" * depth + continuation_region + b")" * depth
        started = time.perf_counter()
        with self.assertRaises(redaction.RedactionPolicyError):
            list(redaction._iter_pdf_decoded_string_payloads(raw))
        elapsed = time.perf_counter() - started
        self.assertLess(elapsed, 1.0, f"nested overlap scan took {elapsed:.3f}s")

    def test_unmatched_literal_stack_is_bounded_fail_closed(self):
        raw = b"(" * (redaction.MAX_PDF_LITERAL_STACK_DEPTH + 1)
        with self.assertRaises(redaction.RedactionPolicyError):
            redaction._pdf_decoded_string_payloads(raw)

    def test_escape_recovery_does_not_retain_a_full_file_candidate(self):
        raw = (b"binary-prefix-\\163-" * 4096) + b"tail"
        self.assertEqual(redaction._pdf_decoded_string_payloads(raw), [])


if __name__ == "__main__":
    unittest.main()
