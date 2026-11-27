import hashlib
import hmac
import json
import os
import runpy
import sys
import tempfile
import unittest
from unittest import mock

import fitz
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import publication_redaction as redaction
from publication_redaction import RedactionPolicyError
from provenance_manifest import manifest_binds_digest
from canonical_pdf_provenance_contract import (
    canonical_contract_sha256,
    validate_frozen_provenance_binding,
    validate_trusted_contract_root,
)
from trusted_preflight_report import sanitize_output_row
from provenance_hardening_bridge import qpdf_decoded_bytes_sealed

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

    def test_rrku_exact_original_preflight_refuses_mutation_and_sanitizes_failures(self):
        import contextlib
        import io
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"))
        preflight = ns["preflight_rrku_exact_originals"]
        root = self.tmpdir
        web = root / "web"
        manifest = root / "project-memory/documents-2026-supplement-2026-11-04-rrku54-annexes.json"
        manifest.parent.mkdir(parents=True)
        docs, scans = [], {}
        for n in range(2, 6):
            rel = f"documents/2026-11-04/rr-ku-54-2021-priloha-{n}.pdf"
            path = web / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            data = f"%PDF-1.4 synthetic fixture {n}".encode()
            path.write_bytes(data)
            sha = hashlib.sha256(data).hexdigest()
            docs.append({"id": f"doc-cz-pcr-ku-2026-11-04-rr-ku-54-2021-priloha-{n}",
                         "annex_index": n, "document_type": "state_record_attachment",
                         "submission_side": "incoming_from_state_or_public_institution",
                         "issue_date": "2026-11-04",
                         "public": {"pdf": rel, "sha256": sha,
                                    "source_original_sha256": sha, "source_original_page_count": 1}})
            scans[rel] = {"inspection": {"source_sha256": sha, "page_count": 1, "reasons": [],
                                          "decoded_scan_ok": True, "decoded_private_hits": [],
                                          "visible_private_hits": [], "raw_private_hits": [],
                                          "embedded_file_count": 0, "text_scan_ok": True,
                                          "qpdf_structurally_valid": True, "pdf_revision_markers_bound": True,
                                          "pdf_single_revision_only": True, "xmp_present": False}}
        registry = {"documents": docs}
        manifest.write_text(json.dumps(registry), "utf-8")
        with mock.patch.dict(preflight.__globals__, {"ROOT": root, "WEB": web,
                "run_isolated_worker": lambda mode, rel, timeout: scans[rel]}):
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(set(preflight(registry)), set(scans))
            rel = docs[0]["public"]["pdf"]
            original = (web / rel).read_bytes()
            scans[rel]["inspection"]["raw_private_hits"] = ["synthetic secret"]
            scans[rel]["inspection"]["reasons"] = ["private_match"]
            out = io.StringIO()
            with contextlib.redirect_stdout(out), self.assertRaisesRegex(SystemExit, "annexes: 2"):
                preflight(registry)
            self.assertNotIn("synthetic secret", out.getvalue())
            self.assertIn('"raw_match_count": 1', out.getvalue())
            self.assertEqual((web / rel).read_bytes(), original)
            scans[rel]["inspection"]["raw_private_hits"] = []
            scans[rel]["inspection"]["reasons"] = []
            docs[0]["public"]["sha256"] = "f"*64
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(SystemExit, "annexes: 2"):
                preflight(registry)

    def test_shadow_worker_supplies_real_decoded_scan_evidence(self):
        import contextlib
        import io
        self.write_policy_and_contract()
        pdf = self.tmpdir / "clean-worker.pdf"
        doc = fitz.open()
        doc.new_page().insert_text((72, 72), "synthetic public text")
        doc.save(pdf)
        doc.close()
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"))
        worker = ns["worker_inspect"]
        with mock.patch.dict(worker.__globals__, {"WEB": self.tmpdir}):
            for mode in ("shadow", "reuse"):
                with mock.patch.dict(os.environ, {"EVIDENCE_LAB_PDF_TRANSFORM_MODE": mode}):
                    out = io.StringIO()
                    with contextlib.redirect_stdout(out):
                        worker(pdf.name)
                    inspection = json.loads(out.getvalue())["inspection"]
                    self.assertEqual(inspection["reasons"], [])
                    self.assertEqual(inspection["source_sha256"], hashlib.sha256(pdf.read_bytes()).hexdigest())
                    if mode == "shadow":
                        self.assertIs(inspection["decoded_scan_ok"], True)
                        self.assertEqual(inspection["decoded_private_hits"], [])
                    else:
                        self.assertNotIn("decoded_scan_ok", inspection)

    def test_real_qpdf_stdout_is_scanned_from_sealed_fd(self):
        # Runs in the no-secrets synthetic privacy job after qpdf installation.
        pdf = self.tmpdir / "synthetic-decoded.pdf"
        doc = fitz.open()
        try:
            page = doc.new_page()
            page.insert_text((72, 72), "SYNTHETIC_QPDF_DECODED_MARKER")
            doc.save(pdf, garbage=4, deflate=True)
        finally:
            doc.close()
        decoded = qpdf_decoded_bytes_sealed(pdf)
        self.assertTrue(decoded.startswith(b"%PDF-"))
        self.assertIn(b"SYNTHETIC_QPDF_DECODED_MARKER", decoded)
        self.assertFalse(list(self.tmpdir.glob("*.qdf.pdf")))

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

    def test_pinned_historical_rewrite_is_path_and_source_bound(self):
        ns = runpy.run_path(
            str(ROOT / "scripts/harden-public-pdf-privacy.py"),
            run_name="pinned_historical_rewrite_test",
        )
        requires = ns["requires_pinned_historical_rewrite"]
        strategy = ns["candidate_strategy"]
        path = ns["HISTORIC_INTERPELLATION_PRIMARY"]
        sha = "e5844a961b84628bee2320e6897a4aa52efefa2b616414760655b872ab9b7a71"
        clean = {"source_sha256": sha, "reasons": [], "xmp_present": False}
        self.assertTrue(requires(path, clean))
        self.assertEqual(strategy(clean, requires(path, clean)), "pymupdf_rewrite")
        self.assertFalse(requires("documents/unrelated.pdf", clean))
        self.assertFalse(requires("documents/interpelace-380-2018/odpoved-andrej-babis-interpelace-380.pdf", clean))
        for wrong in ("f" * 64, None):
            with self.assertRaisesRegex(RuntimeError, "source identity mismatch"):
                requires(path, dict(clean, source_sha256=wrong))
        # Pinned scheduling never overrides real privacy reasons or qpdf checks.
        private = dict(clean, reasons=["private_match"], text_private_hits=["synthetic"])
        self.assertEqual(strategy(private, requires(path, private)), "redact")
        invalid = dict(clean, reasons=["qpdf_invalid"])
        self.assertEqual(strategy(invalid, requires(path, invalid)), "qpdf_rewrite")

    def test_historical_scheduler_consumes_real_inspection_digest(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"))
        source = self.tmpdir / "historical-synthetic.pdf"
        with fitz.open() as doc:
            doc.new_page().insert_text((45, 45), "Synthetic historical public document")
            doc.save(source)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        inspection = ns["inspect_pdf_fast"](source, redaction.prepared_private_byte_matchers())
        requires = ns["requires_pinned_historical_rewrite"]
        rel = ns["HISTORIC_INTERPELLATION_PRIMARY"]
        self.assertEqual(inspection["source_sha256"], digest)
        # Only the test substitutes a synthetic pin; production pin is unchanged.
        with mock.patch.dict(requires.__globals__, {"HISTORIC_INTERPELLATION_SOURCE_SHA": digest}):
            self.assertTrue(requires(rel, inspection))
            with self.assertRaisesRegex(RuntimeError, "source identity mismatch"):
                requires(rel, {k: v for k, v in inspection.items() if k != "source_sha256"})
            with self.assertRaisesRegex(RuntimeError, "source identity mismatch"):
                requires(rel, dict(inspection, source_sha256="f" * 64))

    def test_candidate_strategy_routes_structural_rewrite_away_from_pymupdf(self):
        ns = runpy.run_path(
            str(ROOT / "scripts/harden-public-pdf-privacy.py"),
            run_name="privacy_hardening_strategy_test",
        )
        strategy = ns["candidate_strategy"]

        self.assertEqual(
            strategy({"reasons": ["revision_envelope"], "xmp_present": False}, True),
            "qpdf_rewrite",
        )
        self.assertEqual(
            strategy({"reasons": ["text_scan_failed"], "xmp_present": False}, True),
            "qpdf_rewrite",
        )
        self.assertEqual(
            strategy(
                {"reasons": ["revision_envelope", "private_match"], "xmp_present": False},
                True,
            ),
            "redact",
        )
        self.assertEqual(
            strategy({"reasons": ["suspicious_metadata"], "xmp_present": False}, True),
            "pymupdf_metadata",
        )
        self.assertEqual(
            strategy({"reasons": [], "xmp_present": True}, False),
            "pymupdf_metadata",
        )

    def test_source_page_count_keeps_qpdf_warnings_separate_from_the_count(self):
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"))
        qpdf = ns["subprocess"]
        source = self.tmpdir / "source.pdf"
        warning = qpdf.CompletedProcess([], 3, b"4\n", b"synthetic warning")
        with mock.patch.object(qpdf, "run", return_value=warning) as run:
            self.assertEqual(ns["qpdf_page_count"](source), 4)
            self.assertEqual(run.call_args.kwargs["stderr"], qpdf.PIPE)
            self.assertFalse(ns["qpdf_structure_valid"](source))
        error = qpdf.CompletedProcess([], 2, b"4\n", b"synthetic error")
        with mock.patch.object(qpdf, "run", return_value=error):
            with self.assertRaises(RuntimeError):
                ns["qpdf_page_count"](source)

    def test_qpdf_rewrite_worker_does_not_reenter_deep_pymupdf_inspection(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(
            str(ROOT / "scripts/harden-public-pdf-privacy.py"),
            run_name="privacy_hardening_qpdf_post_test",
        )

        pdf = self.tmpdir / "sample.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.save(pdf)
        doc.close()

        worker_globals = ns["worker_candidate"].__globals__
        worker_globals["WEB"] = self.tmpdir
        worker_globals["private_pdf_rules"] = lambda: ([], "synthetic")
        worker_globals["prepared_private_byte_matchers"] = lambda: object()
        worker_globals["canonicalize_pdf_qpdf"] = lambda path: path.read_bytes()
        worker_globals["inspect_qpdf_rewrite_post"] = lambda path, matchers: {
            "page_count": 1,
            "reasons": [],
            "visible_private_hits": [],
            "text_scan_ok": True,
            "xmp_present": False,
            "decoded_private_hits": [],
            "decoded_scan_ok": True,
            "pdf_revision_markers_bound": True,
            "pdf_single_revision_only": True,
        }

        def forbidden_deep_inspection(*args, **kwargs):
            raise AssertionError("qpdf rewrite must not re-enter inspect_pdf_deep")

        worker_globals["inspect_pdf_deep"] = forbidden_deep_inspection
        original_bytes = pdf.read_bytes()
        stage = self.tmpdir / ".sample.pdf.qpdf-post-test.candidate.pdf"
        stage.write_bytes(original_bytes)
        ns["worker_candidate"](
            "sample.pdf",
            stage.relative_to(self.tmpdir).as_posix(),
            True,
            {
                "page_count": 1,
                "reasons": ["revision_envelope"],
                "xmp_present": False,
                "source_sha256": hashlib.sha256(original_bytes).hexdigest(),
            },
        )
        self.assertEqual(pdf.read_bytes(), original_bytes)

    def test_candidate_routes_mupdf_only_private_text_to_hardening(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/harden-public-pdf-privacy.py"))
        source = self.tmpdir / "mupdf-channel.pdf"
        with fitz.open() as doc:
            doc.new_page().insert_text((45, 45), "private.person@example.invalid")
            doc.save(source)

        original_run = ns["subprocess"].run

        def poppler_misses_private_text(command, *args, **kwargs):
            if command[0] == "pdftotext":
                return subprocess_result
            return original_run(command, *args, **kwargs)

        subprocess_result = mock.Mock(returncode=0, stdout=b"Public text only")
        matchers = redaction.prepared_private_byte_matchers()
        with mock.patch.object(ns["subprocess"], "run", side_effect=poppler_misses_private_text):
            result = ns["inspect_pdf_fast"](source, matchers)

        self.assertEqual(result["source_sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertTrue(result["text_scan_ok"])
        self.assertIn("private_match_1", result["visible_private_hits"])
        self.assertEqual(ns["candidate_strategy"](result, True), "redact")

    def test_id68_rendering_rebuilds_from_pinned_transcript(self):
        self.write_policy_and_contract()
        audit = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"))
        renderer = runpy.run_path(str(ROOT / "scripts/materialize-godot-state-text-pdfs.py"))
        filename = Path(audit["ID68_PATH"]).name
        sources = renderer["SOURCES"][filename]
        self.assertEqual(audit["sha256_file"](sources[0]), audit["ID68_TRANSCRIPT_SHA256"])
        renderer["register_state_font"]()
        first = self.tmpdir / "first" / filename
        second = self.tmpdir / "second" / filename
        renderer["make_pdf"](first, sources)
        renderer["make_pdf"](second, sources)
        self.assertEqual(audit["sha256_file"](first), audit["sha256_file"](second))
        with fitz.open(first) as doc:
            self.assertEqual(doc.page_count, 4)

    def test_targeted_pdf_rules_selects_only_detected_rule_indexes(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(
            str(ROOT / "scripts/harden-public-pdf-privacy.py"),
            run_name="privacy_hardening_targeted_rules_test",
        )
        rules = [
            {"id": "r1", "variants": ["one"], "replacement": "[x]"},
            {"id": "r2", "variants": ["two"], "replacement": "[x]"},
            {"id": "r3", "variants": ["three"], "replacement": "[x]"},
        ]
        selected = ns["targeted_pdf_rules"](
            rules,
            ["r2", "r3", "r2"],
        )
        self.assertEqual([rule["id"] for rule in selected], ["r2", "r3"])

    def test_targeted_rule_selection_falls_back_to_full_rules_when_mapping_is_empty(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(
            str(ROOT / "scripts/harden-public-pdf-privacy.py"),
            run_name="privacy_hardening_targeted_fallback_test",
        )
        rules = [
            {"id": "r1", "variants": ["one"], "replacement": "[x]"},
            {"id": "r2", "variants": ["two"], "replacement": "[x]"},
        ]
        selected = ns["targeted_pdf_rules"](rules, [])
        self.assertEqual(selected, [])

    def test_metadata_only_private_match_uses_metadata_strategy(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(
            str(ROOT / "scripts/harden-public-pdf-privacy.py"),
            run_name="privacy_hardening_metadata_strategy_test",
        )
        strategy = ns["candidate_strategy"](
            {
                "reasons": ["private_match"],
                "text_private_hits": [],
                "metadata_private_hits": ["private_match_1"],
                "xmp_present": False,
            },
            True,
        )
        self.assertEqual(strategy, "pymupdf_metadata")

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

    def test_trusted_provenance_contract_root_rejects_substitution(self):
        original = b'{"schema_version":1,"records":[{"id":"doc-example"}]}'
        substituted = b'{"schema_version":1,"records":[{"id":"doc-example","changed":true}]}'
        trusted = canonical_contract_sha256(original)
        self.assertEqual(validate_trusted_contract_root(original, trusted), [])
        errors = validate_trusted_contract_root(substituted, trusted)
        self.assertTrue(any("trusted external SHA-256 root" in error for error in errors))
        self.assertTrue(validate_trusted_contract_root(original, ""))

    def test_release_audit_rejects_inline_image_filter_payload(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_inline_image_test")
        pdf = self.tmpdir / "inline-image.pdf"

        literal = "Příliš žluťoučký kůň 42".encode("utf-8")
        pixels = (literal + b"|") * 40
        pixels = (pixels + b"X" * 1024)[:1024]
        compressed = __import__("zlib").compress(pixels, level=9)
        content = (
            b"q\n"
            b"BI /W 32 /H 32 /CS /G /BPC 8 /F /FlateDecode ID\n"
            + compressed
            + b"\nEI\nQ\n"
        )

        doc = fitz.open()
        page = doc.new_page()
        xref = doc.get_new_xref()
        doc.update_object(xref, "<< /Length 0 >>")
        doc.update_stream(xref, content, compress=False)
        doc.xref_set_key(page.xref, "Contents", f"{xref} 0 R")
        doc.save(pdf)
        doc.close()

        raw = pdf.read_bytes()
        self.assertNotIn(literal, raw)

        facts = ns["pdf_facts"](pdf)
        self.assertGreater(facts["inline_image_stream_count"], 0)
        self.assertEqual(facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

        root = self.tmpdir / "inline-image-tree"
        root.mkdir()
        (root / "inline-image.pdf").write_bytes(pdf.read_bytes())
        rows, failures = ns["audit_all_web_pdfs"](root)
        self.assertTrue(any("inline-image.pdf" in failure and "inline_images_absent" in failure for failure in failures))

    def test_release_audit_rejects_inline_image_operator_beyond_8192_bytes(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_inline_image_long_test")

        padding = b"/Comment (" + (b"A" * 9000) + b") "
        stream = b"q\nBI /W 1 /H 1 /CS /G /BPC 8 " + padding + b"ID\nX\nEI\nQ\n"

        self.assertTrue(ns["inline_image_operator_present"](stream))

    def test_release_audit_inline_image_scanner_many_bi_without_id(self):
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_inline_image_linear_test")
        stream = (b" BI /W 1 /H 1 /CS /G /BPC 8 " * 20000) + b" Q"
        self.assertFalse(ns["inline_image_operator_present"](stream))

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

    def test_release_audit_rejects_incremental_multi_revision_pdf(self):
        self.write_policy_and_contract()
        ns = runpy.run_path(str(ROOT / "scripts/audit-release-evidence-2026-11-13.py"), run_name="release_audit_incremental_test")
        pdf = self.tmpdir / "incremental.pdf"

        doc = fitz.open()
        doc.new_page()
        doc.save(pdf)
        doc.close()

        doc = fitz.open(pdf)
        metadata = doc.metadata or {}
        metadata["subject"] = "synthetic incremental update"
        doc.set_metadata(metadata)
        doc.saveIncr()
        doc.close()

        facts = ns["pdf_facts"](pdf)
        self.assertFalse(facts["pdf_single_revision_only"])
        self.assertGreaterEqual(facts["pdf_eof_count"], 2)
        self.assertEqual(facts["machine_privacy_status"], "FAIL_PRIVATE_OR_METADATA_CHANNEL")

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
