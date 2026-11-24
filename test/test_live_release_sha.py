"""Regression tests for live PDF states before and after an authorized release."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from live_release_sha import accepted_live_public_sha


class LiveReleaseShaTests(unittest.TestCase):
    reviewed = "a" * 64
    hardened = "b" * 64
    substituted = "c" * 64

    def test_reviewed_pre_release_copy(self):
        self.assertTrue(accepted_live_public_sha(self.reviewed, self.reviewed, self.hardened, True))

    def test_exact_verified_new_public_copy(self):
        self.assertTrue(accepted_live_public_sha(self.hardened, self.reviewed, self.hardened, True))

    def test_unknown_pdf_is_rejected(self):
        self.assertFalse(accepted_live_public_sha(self.substituted, self.reviewed, self.hardened, True))

    def test_unverified_new_public_copy_is_rejected(self):
        self.assertFalse(accepted_live_public_sha(self.hardened, self.reviewed, self.hardened, False))

    def test_malformed_hash_is_rejected(self):
        for malformed in ("", "bad", "B" * 64, None, "0" * 65):
            self.assertFalse(accepted_live_public_sha(malformed, self.reviewed, self.hardened, True))


if __name__ == "__main__":
    unittest.main()
