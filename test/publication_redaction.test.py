import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from publication_redaction import redact_public_text, forbidden_public_identifiers

class PublicationRedactionTests(unittest.TestCase):
    def test_keeps_full_name_but_reduces_private_identifiers(self):
        source = """Mgr. Dušan Dvořák
nar. 12. 1. 1962
Ospělov č. p. 6, 798 55 Ludmírov
IDDS: r8u3nhx
(By email only - DusanDvorak@seznam.cz)
"""
        public = redact_public_text(source)
        self.assertIn("Mgr. Dušan Dvořák", public)
        self.assertIn("1962", public)
        self.assertNotIn("12. 1. 1962", public)
        self.assertNotIn("Ospělov", public)
        self.assertNotIn("798 55", public)
        self.assertNotIn("r8u3nhx", public)
        self.assertNotIn("DusanDvorak@seznam.cz", public)
        self.assertEqual(forbidden_public_identifiers(public), [])

    def test_removes_residual_postal_address_after_redaction_marker(self):
        source = "žalobce: Mgr. Dušan Dvořák, nar. 1962, bytem [soukromá adresa redigována], 798 55 Ludomír 1"
        public = redact_public_text(source)
        self.assertNotIn("798 55 Ludomír 1", public)
        self.assertIn("[zbylá část soukromé adresy redigována]", public)
        self.assertEqual(forbidden_public_identifiers(public), [])

    def test_redacts_current_postcode_variants(self):
        cases = [
            "798 55 Ospělov",
            "79855",
            "79855 Ospělov 6",
            "bytem Ospělov 6, 798 55 Ospělov",\n            "narozen 12. ledna 1962",
        ]
        for source in cases:
            public = redact_public_text(source)
            self.assertNotIn("798 55 Ospělov", public)
            self.assertNotIn("79855", public)
            self.assertNotIn("Ospělov 6", public)
            self.assertEqual(forbidden_public_identifiers(public), [])

    def test_current_repository_sources_redact_to_policy(self):
        root = Path(__file__).resolve().parents[1]
        paths = [
            "project-memory/state-text-sources-2026-08-25/72-md-46042-2026-010-4.txt",
            "project-memory/state-text-sources-2026-08-27/79-szu-10724-2026-2026-08-25.txt",
            "project-memory/state-text-sources-2026-08-27/80-szu-10724-2026-decision-2026-08-26.txt",
            "project-memory/state-text-sources-2026-09-03/osz-fm-1-zn-7061-2026-79-2026-09-03.txt",
        ]
        for rel in paths:
            source = (root / rel).read_text("utf-8")
            public = redact_public_text(source)
            self.assertEqual(forbidden_public_identifiers(public), [], rel)

    def test_does_not_redact_institutional_contact(self):
        source = "Tel.: +420 974 721 111 E-mail: krpt.podatelna@policie.gov.cz"
        self.assertEqual(redact_public_text(source), source)

if __name__ == "__main__":
    unittest.main()
