"""Synthetic checks for same-run registry PDF fact reuse."""
import sys
import unittest
from pathlib import Path
from copy import deepcopy

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from registry_pdf_fact_reuse import root_rows_by_path, registry_facts_from_row

SHA = "a" * 64
REL = "documents/fixture.pdf"


def row():
    return {
        "published_path": REL, "source_web_path": REL, "compatibility_copy": False,
        "sha256": SHA, "page_count": 3, "known_private_identifier_hits": [],
        "machine_privacy_status": "NO_OBVIOUS_HIGH_RISK_PATTERN",
        "metadata_keys_present": [], "xmp_present": False, "embedded_file_count": 0,
        "file_attachment_annotation_count": 0, "associated_file_reference_count": 0,
        "embedded_file_object_count": 0, "suspicious_metadata_keys": [],
        "xmp_known_private_identifier_hits": [], "xmp_suspicious": False,
        "checks": dict.fromkeys(["pdf_header_prefix_clean", "pdf_eof_present",
            "pdf_revision_markers_bound", "pdf_single_revision_only", "qpdf_structurally_valid",
            "pdf_trailing_payload_absent", "inline_images_absent"], True),
    }


class FactReuseTests(unittest.TestCase):
    def test_clean_and_negative_checks_preserved(self):
        original = row()
        facts = registry_facts_from_row(original, REL, SHA)
        self.assertFalse(facts["non_whitespace_prefix_before_pdf_header"])
        self.assertTrue(facts["qpdf_structurally_valid"])
        self.assertEqual(facts["inline_image_stream_count"], 0)
        for name in original["checks"]:
            original["checks"][name] = False
        original["known_private_identifier_hits"] = ["synthetic-rule-id"]
        facts = registry_facts_from_row(original, REL, SHA)
        self.assertTrue(facts["non_whitespace_prefix_before_pdf_header"])
        self.assertTrue(facts["non_whitespace_suffix_after_pdf_eof"])
        self.assertFalse(facts["qpdf_structurally_valid"])
        self.assertFalse(facts["pdf_revision_markers_bound"])
        self.assertEqual(facts["inline_image_stream_count"], 1)
        self.assertEqual(facts["known_private_identifier_hits"], ["synthetic-rule-id"])

    def test_wrong_sha_and_missing_row_fail(self):
        for value, sha in [(row(), "b" * 64), (None, SHA), (row(), "")]:
            with self.assertRaises(ValueError):
                registry_facts_from_row(value, REL, sha)

    def test_missing_or_nonboolean_checks_fail(self):
        for key in row()["checks"]:
            for value in [None, 1, "true"]:
                candidate = row()
                candidate["checks"][key] = value
                with self.assertRaises(ValueError):
                    registry_facts_from_row(candidate, REL, SHA)

    def test_missing_fact_fails(self):
        candidate = row()
        del candidate["known_private_identifier_hits"]
        with self.assertRaises(ValueError):
            registry_facts_from_row(candidate, REL, SHA)

    def test_duplicate_root_fails_and_mirror_cannot_substitute(self):
        mirror = deepcopy(row())
        mirror.update(compatibility_copy=True, published_path="web/" + REL)
        self.assertEqual(root_rows_by_path([mirror]), {})
        self.assertEqual(root_rows_by_path([mirror, row()]), {REL: row()})
        with self.assertRaises(ValueError):
            root_rows_by_path([row(), row()])
        with self.assertRaises(ValueError):
            registry_facts_from_row(mirror, REL, SHA)


if __name__ == "__main__":
    unittest.main(verbosity=2)
