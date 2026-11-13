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

    def test_does_not_redact_institutional_contact(self):
        source = "Tel.: +420 974 721 111 E-mail: krpt.podatelna@policie.gov.cz"
        self.assertEqual(redact_public_text(source), source)

if __name__ == "__main__":
    unittest.main()
