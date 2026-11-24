import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import pinned_late_baseline as pinned


class PinnedBaselineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = self.root / "prior"
        self.base.mkdir()
        self.rel = "documents/a.pdf"
        self.data = b"%PDF-1.4\nsynthetic\n%%EOF\n"
        self.digest = hashlib.sha256(self.data).hexdigest()
        self.source = "a" * 64
        self.policy = "b" * 64
        self.identity = "c" * 64
        self.pin = {"id": "doc-test", "path": self.rel, "kind": "redact",
                    "source_sha256": self.source, "pages": 1, "public_sha256": self.digest,
                    "public_size": len(self.data), "public_git_blob": hashlib.sha1(
                        b"blob " + str(len(self.data)).encode() + b"\0" + self.data).hexdigest()}
        self.repo = "dusandvorak-byte/ai-advocate-evidence-lab"
        self.env = patch.dict(os.environ, {"EVIDENCE_LAB_PINNED_LATE_BASELINE": str(self.base),
            "RUNNER_TEMP": str(self.root), "GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/main",
            "GITHUB_EVENT_NAME": "push", "GITHUB_REPOSITORY": self.repo})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.mock_pins = patch.object(pinned, "read_pins", return_value={self.rel: self.pin})
        self.mock_pins.start()
        self.addCleanup(self.mock_pins.stop)
        self.run = {"id": pinned.RUN, "head_sha": pinned.SOURCE, "run_attempt": 1,
                    "head_branch": "main", "event": "push", "path": ".github/workflows/trusted-pdf-shard-diagnostic.yml",
                    "status": "completed", "conclusion": "success", "repository": {"full_name": self.repo},
                    "head_repository": {"full_name": self.repo}}
        self.report = {"checkout_commit": pinned.SOURCE, "github_event_sha": pinned.SOURCE,
            "summary": {"hard_failure_count": 0, "hard_failures": []},
            "registry_web_stage_reconciliation": {"staged_set_exact_match": True, "id69_absent_from_final_release_state": True},
            "privacy_hardening": {"schema_version": "1.2", "policy_sha256": self.policy,
                "authenticated_private_policy_identity": self.identity, "hard_failure_count": 0, "hard_failures": [],
                "documents": [{"id": "doc-test", "public_path": self.rel, "input_sha256": self.source,
                  "output_sha256": self.digest, "page_count": 1, "changed": True, "registered": True,
                  "strategy": "redact", "text_fallback": None, "known_private_identifier_hits_after": [],
                  "decoded_private_identifier_hits_after": [], "redaction_matches": [{"page": 1, "rule": "synthetic"}]}]},
            "all_final_web_pdfs": [{"published_path": path, "sha256": self.digest, "page_count": 1,
                                  "checks": {"synthetic": True}} for path in (self.rel, "web/" + self.rel)]}
        self.write("run.json", json.dumps(self.run).encode())
        self.save_report()
        for path in (self.rel, "web/" + self.rel):
            self.write("tree/release-site/" + path, self.data)

    def write(self, path, data):
        target = self.base / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def save_report(self):
        self.write("report/release-evidence-audit.json", json.dumps(self.report).encode())

    def restore(self, **overrides):
        args = dict(rel=self.rel, source_sha=self.source, pages=1, policy_sha=self.policy, identity=self.identity)
        args.update(overrides)
        return pinned.restore_redacted_pin(**args)

    def test_exact_bytes_and_prior_provenance(self):
        data, matches, evidence = self.restore()
        self.assertEqual(data, self.data)
        self.assertEqual(matches, [{"page": 1, "rule": "synthetic"}])
        self.assertEqual(evidence["public_sha256"], self.digest)

    def test_changed_source_or_policy_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "source identity"):
            self.restore(source_sha="d" * 64)
        with self.assertRaisesRegex(RuntimeError, "policy or hardening"):
            self.restore(identity="e" * 64)

    def test_tampered_mirror_rejected(self):
        self.write("tree/release-site/web/" + self.rel, b"changed")
        with self.assertRaisesRegex(RuntimeError, "prior public bytes"):
            self.restore()

    def test_failed_prior_check_rejected(self):
        self.report["all_final_web_pdfs"][0]["checks"]["synthetic"] = False
        self.save_report()
        with self.assertRaisesRegex(RuntimeError, "staged PDF audit"):
            self.restore()

    def test_wrong_run_rejected(self):
        self.run["run_attempt"] = 2
        self.write("run.json", json.dumps(self.run).encode())
        with self.assertRaisesRegex(RuntimeError, "prior run identity"):
            self.restore()

    def test_no_baseline_or_unpinned_returns_no_reuse(self):
        self.assertIsNone(self.restore(rel="documents/unpinned.pdf"))
        with patch.dict(os.environ, {"EVIDENCE_LAB_PINNED_LATE_BASELINE": ""}):
            self.assertIsNone(self.restore())


if __name__ == "__main__":
    unittest.main()
