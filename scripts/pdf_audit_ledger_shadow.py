"""Opt-in shadow measurement of content-addressed audit hits.

Does not change audit outcomes: a fresh scan remains authoritative.
No cross-run store or signing key is provisioned by this module.
"""
from __future__ import annotations

import copy
import os
from pathlib import Path
import threading
import time

from pdf_audit_ledger import Ledger, file_sha
from pdf_audit_engine_fingerprint import engine_fingerprint

ROOT = Path(__file__).resolve().parents[1]


class ShadowAuditLedger:
    def __init__(self, store, key, policy_sha, identity, engine_sha, origin, checkout=ROOT):
        self.ledger = Ledger(store, key, checkout)
        self.identity = dict(policy_sha=policy_sha, private_policy_identity=identity, engine_sha=engine_sha)
        self.origin = origin
        self.lock = threading.Lock()
        self.stats = {"hits": 0, "misses": 0, "mismatches": 0, "recorded": 0,
                      "cache_lookup_ms": 0, "fresh_scan_ms": 0}

    def metrics(self):
        """Aggregate timing only; never export private identity or signing key."""
        with self.lock:
            return {**self.stats, "fresh_scan_authoritative": True, "skipped": 0}

    def compare(self, path, scan):
        digest = file_sha(path)
        start = time.monotonic()
        prior = self.ledger.lookup(pdf_path=path, **self.identity)
        elapsed_lookup = round((time.monotonic() - start) * 1000)
        start = time.monotonic()
        fresh = scan(path)
        elapsed_scan = round((time.monotonic() - start) * 1000)
        if file_sha(path) != digest:
            raise RuntimeError("PDF changed during shadow audit")
        # Compare every semantic fact, not diagnostic qpdf stderr (not cached).
        compare_fresh = dict(fresh)
        compare_fresh["qpdf_check_tail"] = ""
        equal = prior is not None and prior == compare_fresh
        # A mismatch is not overwritten or treated as a valid hit.
        recorded = False
        if prior is None:
            recorded = self.ledger.record(pdf_path=path, expected_pdf_sha=digest, facts=fresh,
                                         origin=self.origin, **self.identity)
        with self.lock:
            self.stats["cache_lookup_ms"] += elapsed_lookup
            self.stats["fresh_scan_ms"] += elapsed_scan
            self.stats["hits" if equal else ("misses" if prior is None else "mismatches")] += 1
            self.stats["recorded"] += int(recorded)
        return copy.deepcopy(fresh)


def from_trusted_environment(policy_sha, identity):
    if os.environ.get("EVIDENCE_LAB_PDF_LEDGER_MODE") != "shadow":
        return None
    if not (os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("GITHUB_EVENT_NAME") == "push"
            and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_REPOSITORY") == "dusandvorak-byte/ai-advocate-evidence-lab"
            and os.environ.get("GITHUB_WORKFLOW_REF") ==
                "dusandvorak-byte/ai-advocate-evidence-lab/.github/workflows/trusted-pdf-shard-diagnostic.yml@refs/heads/main"):
        raise ValueError("shadow ledger requires trusted workflow")
    # A different secret from the private policy authentication key.
    key = bytes.fromhex(os.environ["EVIDENCE_LAB_PDF_LEDGER_HMAC_KEY"])
    store = Path(os.environ["EVIDENCE_LAB_PDF_LEDGER_DIR"])
    origin = dict(repository=os.environ["GITHUB_REPOSITORY"],
                  workflow=".github/workflows/trusted-pdf-shard-diagnostic.yml",
                  run_id=int(os.environ["GITHUB_RUN_ID"]), run_attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
                  source_commit=os.environ["GITHUB_SHA"])
    return ShadowAuditLedger(store, key, policy_sha, identity, engine_fingerprint(), origin)
