import hashlib
import hmac
import json
import os
import runpy
import sys
import tempfile
import unittest

import fitz
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import publication_redaction as redaction
from publication_redaction import RedactionPolicyError
from provenance_manifest import manifest_binds_digest
from canonical_pdf_provenance_contract import validate_frozen_provenance_binding
from trusted_preflight_report import sanitize_output_row

PUBLIC_CONTRACT = json.loads((ROOT / "project-memory/private-redaction-policy-contract.json").read_text("utf-8"))


class PublicationRedactionTests(unittest.TestCase):
    def setUp(self):
        self.original_policy = os.environ.get("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY")
        self.original_key = os.environ.get("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY")
        self.original_contract_path = redaction.CONTRACT_PATH
        self.tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self.tmp.name)
        self.policy_path = self.tmpdir / "private-policy.json"
        self.contract_path = self.tmpdir / "public-contract.json"
        redaction.CONTRACT_PATH = self.contract_path
        self.key = "synthetic-hmac-key-for-tests-only"
        os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY"] = self.key

    def tearDown(self):
        redaction.CONTRACT_PATH = self.original_contract_path
        if self.original_policy is None:
            os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY", None)
        else:
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = self.original_policy
        if self.original_key is None:
            os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY", None)
        else:
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY_HMAC_KEY"] = self.original_key
        self.tmp.cleanup()

    def policy_payload(self):
        return {
            "policy_id": PUBLIC_CONTRACT["policy_id"],
            "revision": PUBLIC_CONTRACT["revision"],
            "revision_token": PUBLIC_CONTRACT["revision_token"],
            "rules": [
                {"id": "private_email", "mode": "literal", "value": "private.person@example.invalid", "replacement": "[private email redacted]"},
                {"id": "private_data_box", "mode": "literal", "value": "ab12cd3", "replacement": "[private data-box redacted]"},
                {"id": "private_birth_date", "mode": "literal", "value": "3. 2. 1974", "replacement": "1974"},
                {"id": "private_address_wrapped", "mode": "regex", "value": r"SecretTown\s+42\s*,?\s*123\s*45\s*\n?\s*Exampleville", "replacement": "Exampleville", "pdf_variants": ["SecretTown 42, 123 45"]},
                {"id": "private_czech_literal", "mode": "literal", "value": "Příliš žluťoučký kůň 42", "replacement": "[synthetic Czech literal redacted]"},
            ],
            "forbidden": [
                {"mode": "literal", "value": "private.person@example.invalid"},
                {"mode": "literal", "value": "ab12cd3"},
                {"mode": "literal", "value": "3. 2. 1974"},
                {"mode": "regex", "value": r"SecretTown\s+42"},
                {"mode": "literal", "value": "Příliš žluťoučký kůň 42"},
            ],
        }

    def canonical(self, payload):
        signed = {
            "policy_id": payload.get("policy_id"),
            "revision": payload.get("revision"),
            "revision_token": payload.get("revision_token"),
            "rules": payload.get("rules") or [],
            "forbidden": payload.get("forbidden") or [],
        }
        return json.dumps(signed, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

    def write_policy_and_contract(self, payload=None, *, approved_payload=None):
        payload = payload or self.policy_payload()
        approved_payload = approved_payload or payload
        approved_hmac = hmac.new(self.key.encode("utf-8"), self.canonical(approved_payload), hashlib.sha256).hexdigest()
        contract = dict(PUBLIC_CONTRACT)
        contract["approved_policy_hmac"] = approved_hmac
        self.contract_path.write_text(json.dumps(contract), "utf-8")
        self.policy_path.write_text(json.dumps(payload), "utf-8")
        os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = str(self.policy_path)

    def test_requires_private_policy(self):
        contract = dict(PUBLIC_CONTRACT)
        contract["approved_policy_hmac"] = "0" * 64
        self.contract_path.write_text(json.dumps(contract), "utf-8")
        os.environ.pop("EVIDENCE_LAB_PRIVATE_REDACTION_POLICY", None)
        with self.assertRaises(RedactionPolicyError):
            redaction.redact_public_text("synthetic input")

    def test_rejects_private_policy_inside_public_repository(self):
        # Use the real public repository path only to test path containment; contents are synthetic.
        redaction.CONTRACT_PATH = ROOT / "project-memory/private-redaction-policy-contract.json"
        local = ROOT / ".tmp-public-policy-test.json"
        try:
            local.write_text(json.dumps(self.policy_payload()), "utf-8")
            os.environ["EVIDENCE_LAB_PRIVATE_REDACTION_POLICY"] = str(local)
            with self.assertRaises(RedactionPolicyError):
                redaction.redact_public_text("synthetic input")
        finally:
            local.unlink(missing_ok=True)

    def test_rejects_tampered_policy_with_same_revision_and_token(self):
        approved = self.policy_payload()
        tampered = json.loads(json.dumps(approved))
        tampered["rules"][0]["replacement"] = "[tampered replacement]"
        self.write_policy_and_contract(tampered, approved_payload=approved)
        with self.assertRaises(RedactionPolicyError):
            redaction.redact_public_text("private.person@example.invalid")

    def test_rejects_unsupported_forbidden_mode(self):
        payload = self.policy_payload()
        payload["forbidden"][0]["mode"] = "litrael"
        self.write_policy_and_contract(payload)
        with self.assertRaises(RedactionPolicyError):
            redaction.forbidden_public_identifiers("private.person@example.invalid")

    def test_synthetic_private_values_are_redacted(self):
        self.write_policy_and_contract()
        source = """Public Person
born 3. 2. 1974
SecretTown 42, 123 45
Exampleville
ID: ab12cd3
private.person@example.invalid
"""
        public = redaction.redact_public_text(source)
        self.assertIn("Public Person", public)
        self.assertIn("1974", public)
        self.assertNotIn("3. 2. 1974", public)
        self.assertNotIn("SecretTown 42", public)
        self.assertNotIn("ab12cd3", public)
        self.assertNotIn("private.person@example.invalid", public)
        self.assertEqual(redaction.forbidden_public_identifiers(public), [])

    def test_unlisted_institutional_contact_is_preserved(self):
        self.write_policy_and_contract()
        source = "Office: public.registry@example.invalid"
        self.assertEqual(redaction.redact_public_text(source), source)

    def test_forbidden_matches_return_only_opaque_labels(self):
        self.write_policy_and_contract()
        hits = redaction.forbidden_public_identifiers("private.person@example.invalid and ab12cd3")
        self.assertEqual(hits, ["private_match_1", "private_match_2"])
        self.assertTrue(all("example.invalid" not in hit and "ab12cd3" not in hit for hit in hits))

    def test_regex_policy_requires_pdf_variants_for_pdf_hardening(self):
        payload = self.policy_payload()
        regex_rule = next(rule for rule in payload["rules"] if rule["id"] == "private_address_wrapped")
        regex_rule.pop("pdf_variants", None)
        self.write_policy_and_contract(payload)
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"), run_name="privacy_hardening_test")
        with self.assertRaises(SystemExit):
            ns["private_pdf_rules"]()

    def test_rejects_scalar_pdf_variants(self):
        payload = self.policy_payload()
        regex_rule = next(rule for rule in payload["rules"] if rule["id"] == "private_address_wrapped")
        regex_rule["pdf_variants"] = "SecretTown 42, 123 45"
        self.write_policy_and_contract(payload)
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"), run_name="privacy_hardening_scalar_test")
        with self.assertRaises(SystemExit):
            ns["private_pdf_rules"]()

    def test_rule_is_post_checked_even_if_missing_from_forbidden_list(self):
        payload = self.policy_payload()
        payload["forbidden"] = payload["forbidden"][1:]
        self.write_policy_and_contract(payload)
        hits = redaction.forbidden_public_identifiers("private.person@example.invalid")
        self.assertTrue(hits)
        self.assertTrue(all("example.invalid" not in hit for hit in hits))

    def test_synthetic_pdf_line_wrapped_address_is_redacted_in_text_and_render(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"), run_name="privacy_hardening_e2e")
        rules, _ = ns["private_pdf_rules"]()

        pdf = self.tmpdir / "synthetic.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Public Person")
        page.insert_text((72, 96), "SecretTown 42, 123 45")
        page.insert_text((72, 120), "Exampleville")
        doc.save(pdf)
        doc.close()

        before_doc = fitz.open(pdf)
        before_text = "\n".join(p.get_text("text") for p in before_doc)
        before_render = before_doc[0].get_pixmap().samples
        before_doc.close()
        self.assertIn("SecretTown 42", before_text)

        data, matches = ns["harden_pdf"](pdf, rules)
        self.assertIsNotNone(data)
        self.assertTrue(any(m["rule"] == "private_address_wrapped" for m in matches))
        pdf.write_bytes(data)

        after_doc = fitz.open(pdf)
        after_text = "\n".join(p.get_text("text") for p in after_doc)
        after_render = after_doc[0].get_pixmap().samples
        after_doc.close()

        self.assertNotIn("SecretTown 42", after_text)
        self.assertNotEqual(hashlib.sha256(before_render).hexdigest(), hashlib.sha256(after_render).hexdigest())
        self.assertEqual(redaction.forbidden_public_identifiers(after_text), [])

    def test_metadata_is_sanitized_even_without_text_match(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"), run_name="privacy_hardening_metadata_test")
        rules, _ = ns["private_pdf_rules"]()

        pdf = self.tmpdir / "metadata-only.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Public text only")
        doc.set_metadata({"author": "private.person@example.invalid", "subject": "/Users/private/local/path"})
        doc.save(pdf)
        doc.close()

        data, matches = ns["harden_pdf"](pdf, rules)
        self.assertIsNotNone(data)
        self.assertEqual(matches, [])
        pdf.write_bytes(data)

        after_doc = fitz.open(pdf)
        metadata = after_doc.metadata or {}
        after_doc.close()
        writable_fields = ("title", "author", "subject", "keywords", "creator", "producer", "creationDate", "modDate", "trapped")
        self.assertTrue(all(not metadata.get(field) for field in writable_fields))

    def test_xmp_metadata_is_removed_even_without_text_match(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"), run_name="privacy_hardening_xmp_test")
        rules, _ = ns["private_pdf_rules"]()

        pdf = self.tmpdir / "xmp-only.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Public text only")
        doc.set_xml_metadata("""<?xpacket begin=''?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
  <rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
    <rdf:Description xmlns:dc='http://purl.org/dc/elements/1.1/' dc:creator='private.person@example.invalid'/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>""")
        doc.save(pdf)
        doc.close()

        data, matches = ns["harden_pdf"](pdf, rules)
        self.assertIsNotNone(data)
        self.assertEqual(matches, [])
        pdf.write_bytes(data)

        after_doc = fitz.open(pdf)
        xmp = after_doc.get_xml_metadata() or ""
        after_doc.close()
        self.assertEqual(xmp, "")

    def test_release_audit_detects_file_attachment_annotations(self):
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_attachment_test")
        pdf = self.tmpdir / "attachment.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Public text only")
        page.add_file_annot((72, 96), b"synthetic private attachment", "private.txt")
        doc.save(pdf)
        doc.close()

        reopened = fitz.open(pdf)
        count = ns["file_attachment_annotation_count"](reopened)
        reopened.close()
        self.assertEqual(count, 1)

    def test_frozen_provenance_contract_rejects_status_switch(self):
        expected = {
            "id": "doc-example",
            "path": "documents/example.pdf",
            "status": "historical-introduction-and-blob-continuity-verified",
        }
        item = {
            "id": "doc-example",
            "public": {
                "pdf": "documents/example.pdf",
                "sha256_provenance_status": "deterministic-generated-public-copy-verified",
            },
        }
        errors = validate_frozen_provenance_binding(expected, item)
        self.assertTrue(any("method/status changed" in error for error in errors))

    def test_release_audit_rejects_forged_final_eof_marker(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_forged_eof_test")
        root = self.tmpdir / "forged-eof"
        root.mkdir()

        clean = root / "base.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.save(clean)
        doc.close()
        raw = clean.read_bytes()
        match = list(__import__("re").finditer(br"startxref\s+(\d+)\s+%%EOF", raw))[-1]
        original_xref = match.group(1)

        forged = root / "forged.pdf"
        forged.write_bytes(
            raw
            + b"\nsynthetic-forbidden@example.invalid\nstartxref\n"
            + original_xref
            + b"\n%%EOF\n"
        )
        clean.unlink()

        facts = ns["pdf_facts"](forged)
        self.assertFalse(facts["pdf_revision_markers_bound"])
        self.assertFalse(facts["pdf_startxref_offsets_unique"])
        self.assertEqual(facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

        rows, failures = ns["audit_all_web_pdfs"](root)
        self.assertTrue(any("forged.pdf" in failure and "pdf_revision_markers_bound" in failure for failure in failures))

    def test_release_audit_rejects_payload_after_final_pdf_eof(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_eof_test")
        root = self.tmpdir / "eof-payload"
        root.mkdir()

        for filename in ("trailing.pdf", "trailing.bin"):
            clean = root / (filename + ".clean.pdf")
            doc = fitz.open()
            doc.new_page()
            doc.save(clean)
            doc.close()
            payload = clean.read_bytes() + b"\nsynthetic-forbidden@example.invalid\n"
            target = root / filename
            target.write_bytes(payload)
            clean.unlink()

            facts = ns["pdf_facts"](target)
            self.assertTrue(facts["pdf_eof_present"])
            self.assertTrue(facts["non_whitespace_suffix_after_pdf_eof"])
            self.assertEqual(facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

        rows, failures = ns["audit_all_web_pdfs"](root)
        self.assertTrue(any("trailing.pdf" in failure and "pdf_trailing_payload_absent" in failure for failure in failures))
        self.assertTrue(any("trailing.bin" in failure and "pdf_trailing_payload_absent" in failure for failure in failures))

    def test_raw_private_literal_scan_detects_czech_utf8_and_cp1250(self):
        self.write_policy_and_contract()
        from publication_redaction import forbidden_public_identifier_byte_hits
        literal = "Příliš žluťoučký kůň 42"
        self.assertTrue(forbidden_public_identifier_byte_hits(literal.encode("utf-8")))
        self.assertTrue(forbidden_public_identifier_byte_hits(literal.encode("cp1250")))

    def test_raw_private_literal_scan_is_truly_case_insensitive(self):
        self.write_policy_and_contract()
        from publication_redaction import forbidden_public_identifier_byte_hits
        mixed = b"pRiVaTe.PeRsOn@ExAmPlE.InVaLiD"
        self.assertTrue(forbidden_public_identifier_byte_hits(mixed))

    def test_release_audit_rejects_private_literal_in_compressed_unused_stream(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_compressed_stream_test")
        pdf = self.tmpdir / "compressed-unused-stream.pdf"

        doc = fitz.open()
        doc.new_page()
        xref = doc.get_new_xref()
        literal = "Příliš žluťoučký kůň 42".encode("utf-8")
        secret = (literal + b"|") * 64
        compressed = __import__("zlib").compress(secret, level=9)
        doc.update_object(xref, "<< /Length 0 /Filter /FlateDecode >>")
        doc.update_stream(xref, compressed, compress=False)
        doc.xref_set_key(xref, "Filter", "/FlateDecode")
        doc.save(pdf)
        doc.close()

        raw = pdf.read_bytes()
        self.assertNotIn(literal, raw)

        facts = ns["pdf_facts"](pdf)
        self.assertTrue(facts["decoded_object_private_identifier_hits"])
        self.assertEqual(facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

    def test_raw_private_literal_scan_decodes_pdf_hex_and_octal_strings(self):
        self.write_policy_and_contract()
        from publication_redaction import forbidden_public_identifier_byte_hits
        literal = "Příliš žluťoučký kůň 42"
        utf8 = literal.encode("utf-8")
        hex_pdf = b"<< /Unused <" + utf8.hex().encode("ascii") + b"> >>"
        octal = b"".join((f"\\{byte:03o}".encode("ascii") for byte in utf8))
        literal_pdf = b"<< /Unused (" + octal + b") >>"
        self.assertTrue(forbidden_public_identifier_byte_hits(hex_pdf))
        self.assertTrue(forbidden_public_identifier_byte_hits(literal_pdf))

    def test_release_audit_rejects_unique_fake_xref_revision(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_unique_fake_xref_test")
        root = self.tmpdir / "fake-xref"
        root.mkdir()
        clean = root / "base.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.save(clean)
        doc.close()
        raw = clean.read_bytes()
        payload = b"\nSAFE-UNPARSED-PADDING\n"
        fake_offset = len(raw) + len(payload)
        forged = root / "forged.pdf"
        forged.write_bytes(
            raw + payload
            + b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n"
            + str(fake_offset).encode("ascii")
            + b"\n%%EOF\n"
        )
        clean.unlink()
        facts = ns["pdf_facts"](forged)
        self.assertFalse(facts["qpdf_structurally_valid"])
        self.assertEqual(facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

    def test_trusted_preflight_report_preserves_registry_identity(self):
        row = {
            "published_path": "documents/example.pdf",
            "source_web_path": "documents/example.pdf",
            "registry_ids": ["doc-example"],
            "verification_statuses": ["published"],
            "sha256": "a" * 64,
            "page_count": 2,
            "checks": {"privacy": True},
        }
        sanitized = sanitize_output_row(row)
        self.assertEqual(sanitized["registered_ids"], ["doc-example"])
        self.assertEqual(sanitized["registered_statuses"], ["published"])

    def test_release_audit_rejects_ef_dictionary_and_embeddedfile_object(self):
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_ef_test")
        pdf = self.tmpdir / "embedded-file-object.pdf"
        doc = fitz.open()
        page = doc.new_page()
        note = page.add_text_annot((120, 120), "ordinary note")
        doc.xref_set_key(note.xref, "EF", "<< /F 1 0 R >>")
        doc.xref_set_key(page.xref, "Type", "/EmbeddedFile")
        doc.save(pdf)
        doc.close()

        reopened = fitz.open(pdf)
        count = ns["embedded_file_object_count"](reopened)
        reopened.close()
        self.assertGreaterEqual(count, 2)

    def test_manifest_digest_and_binding_must_share_one_record(self):
        manifest = self.tmpdir / "manifest.json"
        digest = "a" * 64
        rel = "documents/example.pdf"
        doc_id = "doc-example"

        manifest.write_text(json.dumps({
            "records": [
                {"id": doc_id, "path": rel},
                {"sha256": digest, "path": "documents/other.pdf"},
            ]
        }), encoding="utf-8")
        manifest_rel = os.path.relpath(manifest, ROOT)
        self.assertFalse(manifest_binds_digest(ROOT, manifest_rel, doc_id, rel, digest))

        manifest.write_text(json.dumps({
            "records": [
                {"id": doc_id, "path": rel, "sha256": digest},
            ]
        }), encoding="utf-8")
        self.assertTrue(manifest_binds_digest(ROOT, manifest_rel, doc_id, rel, digest))

    def test_release_audit_enumerates_mixed_case_and_signature_pdfs(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_inventory_test")
        root = self.tmpdir / "tree"
        root.mkdir()

        for filename in ("lower.pdf", "mixed.PDF", "odd.bin"):
            doc = fitz.open()
            doc.new_page()
            doc.save(root / filename)
            doc.close()

        wrapped_source = root / "wrapped-source.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.save(wrapped_source)
        doc.close()
        wrapped_bytes = b"synthetic-forbidden@example.invalid\n" + wrapped_source.read_bytes()
        wrapped = root / "wrapped.bin"
        wrapped.write_bytes(wrapped_bytes)
        wrapped_source.unlink()

        paths = {p.name for p in ns["publication_pdf_paths"](root)}
        self.assertEqual(paths, {"lower.pdf", "mixed.PDF", "odd.bin", "wrapped.bin"})
        self.assertIn(b"synthetic-forbidden@example.invalid", wrapped.read_bytes()[:1024])

        self.assertGreater(ns["pdf_header_offset"](wrapped), 0)
        facts = ns["pdf_facts"](wrapped)
        self.assertTrue(facts["non_whitespace_prefix_before_pdf_header"])
        self.assertEqual(facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

        mixed_wrapped = root / "wrapped.PDF"
        mixed_wrapped.write_bytes(b"NONWHITESPACE\n" + (root / "mixed.PDF").read_bytes())
        mixed_facts = ns["pdf_facts"](mixed_wrapped)
        self.assertTrue(mixed_facts["non_whitespace_prefix_before_pdf_header"])
        self.assertEqual(mixed_facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

        wrapped_root = self.tmpdir / "wrapped-only"
        wrapped_root.mkdir()
        (wrapped_root / "wrapped.bin").write_bytes(wrapped.read_bytes())
        (wrapped_root / "wrapped.PDF").write_bytes(mixed_wrapped.read_bytes())
        rows, failures = ns["audit_all_web_pdfs"](wrapped_root)
        self.assertTrue(any("wrapped.bin" in failure and "pdf_header_prefix_clean" in failure for failure in failures))
        self.assertTrue(any("wrapped.PDF" in failure and "pdf_header_prefix_clean" in failure for failure in failures))

    def test_release_audit_rejects_catalog_and_page_associated_files(self):
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_af_test")

        pdf = self.tmpdir / "associated-files.pdf"
        doc = fitz.open()
        page = doc.new_page()
        doc.xref_set_key(doc.pdf_catalog(), "AF", f"[{page.xref} 0 R]")
        doc.xref_set_key(page.xref, "AF", f"[{doc.pdf_catalog()} 0 R]")
        note = page.add_text_annot((120, 120), "ordinary note")
        doc.xref_set_key(note.xref, "AF", f"[{doc.pdf_catalog()} 0 R]")
        doc.save(pdf)
        doc.close()

        reopened = fitz.open(pdf)
        count = ns["associated_file_reference_count"](reopened)
        reopened.close()
        self.assertEqual(count, 3)

    def test_verified_identity_is_authenticated_hmac(self):
        self.write_policy_and_contract()
        identity = redaction.verified_private_policy_identity()
        self.assertRegex(identity, r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
