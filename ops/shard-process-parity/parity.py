"""P8 phase B: compare real uncached audit facts across isolated processes.
Synthetic PDFs and authenticated synthetic policy only. No production secrets,
publication authority, trusted artifact, or real document content.
"""
import hashlib
import hmac
import importlib.util
import json
import multiprocessing
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import statistics
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import publication_redaction as redaction

AUDIT = None
MARKER = "SYNTHETIC_PRIVATE_SENTINEL_XYZ"
KEY = "synthetic-test-key-not-a-production-secret"

def provision(root):
    policy = {
        "policy_id": "synthetic-parity", "revision": 1,
        "revision_token": "fixture",
        "rules": [{"id": "test", "mode": "literal", "value": MARKER,
                   "replacement": "[redacted]"}],
        "forbidden": [{"mode": "literal", "value": MARKER}],
    }
    policy_path = root / "policy.json"
    policy_path.write_text(json.dumps(policy), encoding="utf-8")
    digest = hmac.new(KEY.encode(), redaction._canonical_private_policy_bytes(policy),
                      hashlib.sha256).hexdigest()
    contract = {
        "status": "binding", "policy_id": policy["policy_id"],
        "revision": 1, "revision_token": "fixture", "approved_policy_hmac": digest,
        "hmac_algorithm": "sha256", "hmac_key_env": "P8_SYNTHETIC_HMAC",
        "private_policy_env": "P8_SYNTHETIC_POLICY",
    }
    contract_path = root / "contract.json"
    contract_path.write_text(json.dumps(contract), encoding="utf-8")
    return str(policy_path), str(contract_path), digest

def initialize(policy_path, contract_path, digest):
    global AUDIT
    os.environ["P8_SYNTHETIC_HMAC"] = KEY
    os.environ["P8_SYNTHETIC_POLICY"] = policy_path
    os.environ.pop("EVIDENCE_LAB_PDF_LEDGER_MODE", None)
    redaction.CONTRACT_PATH = Path(contract_path)
    if redaction.verified_private_policy_identity() != digest:
        raise RuntimeError("synthetic policy identity mismatch")
    spec = importlib.util.spec_from_file_location(
        "p8_actual_audit", ROOT / "scripts/audit-release-evidence-2026-11-13.py")
    AUDIT = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(AUDIT)
    # Test-only serial page extraction; no nested unsupported PyMuPDF threads.
    # This is the same page-order concatenation as the existing range function.
    AUDIT.parallel_fitz_text = lambda path, count: AUDIT._fitz_text_range(path, 0, count) if count else ""

def scan(path):
    # Do not use any content cache or ledger. Each task executes the real scanner.
    return AUDIT._pdf_facts_uncached(Path(path))

def fixtures(root):
    import fitz
    paths = []
    kinds = ["clean", "multi", "private", "metadata", "attachment", "trailing", "malformed"]
    for index, kind in enumerate(kinds):
        path = root / (kind + ".pdf")
        if kind == "malformed":
            path.write_bytes(b"%PDF-1.7\nnot a valid PDF\n")
        else:
            with fitz.open() as doc:
                for page_index in range(7 if kind == "multi" else 1):
                    page = doc.new_page()
                    page.insert_text((50, 50), MARKER if kind == "private" else
                                     f"Synthetic fixture {index}, page {page_index}")
                if kind == "metadata":
                    doc.set_metadata({"author": "synthetic@example.invalid"})
                if kind == "attachment":
                    doc.embfile_add("fixture.txt", b"synthetic attachment")
                doc.save(path, garbage=4, deflate=True)
            if kind == "trailing":
                with path.open("ab") as handle:
                    handle.write(b"\nsynthetic trailing payload")
        paths.append(str(path))
    return kinds, paths

def measure(paths, workers, initargs):
    started = time.monotonic()
    if workers == 1:
        initialize(*initargs)
        rows = [scan(p) for p in paths]
    else:
        with ProcessPoolExecutor(max_workers=workers,
                                 mp_context=multiprocessing.get_context("spawn"),
                                 initializer=initialize, initargs=initargs) as pool:
            rows = list(pool.map(scan, paths))
    return rows, round((time.monotonic() - started) * 1000)

def main():
    with tempfile.TemporaryDirectory(prefix="p8-synthetic-") as temp:
        root = Path(temp)
        args = provision(root)
        kinds, paths = fixtures(root)
        baseline, _ = measure(paths, 1, args)
        by_kind = dict(zip(kinds, baseline))
        for kind in ("private", "metadata", "attachment", "trailing", "malformed"):
            if by_kind[kind]["machine_privacy_status"] != "FAIL_PRIVATE_OR_METADATA_CHANNEL":
                raise RuntimeError(f"fixture did not fail closed: {kind}")
        for kind in ("clean", "multi"):
            if by_kind[kind]["machine_privacy_status"] != "NO_OBVIOUS_HIGH_RISK_PATTERN":
                raise RuntimeError(f"unexpected synthetic baseline: {kind}")
        if by_kind["multi"]["page_count"] != 7:
            raise RuntimeError("multi-page fixture not fully inspected")
        if not by_kind["private"]["known_private_identifier_hits"]:
            raise RuntimeError("authenticated private matcher not exercised")
        if not all(row["human_privacy_review_required"] for row in baseline):
            raise RuntimeError("human review flag lost")
        times = {n: [] for n in (1, 2, 4)}
        for repetition in range(3):
            order = (1, 2, 4)
            for n in order[repetition:] + order[:repetition]:
                rows, elapsed = measure(paths, n, args)
                if rows != baseline:
                    raise RuntimeError(f"full scanner fact parity failed: {n} workers")
                times[n].append(elapsed)
        # Missing file must propagate out of the worker; no silent empty result.
        with ProcessPoolExecutor(max_workers=2,
                                 mp_context=multiprocessing.get_context("spawn"),
                                 initializer=initialize, initargs=args) as pool:
            try:
                pool.submit(scan, str(root / "absent.pdf")).result(timeout=60)
            except FileNotFoundError:
                pass
            else:
                raise RuntimeError("worker failure was not propagated")
        print(json.dumps({"synthetic_fixtures": len(paths), "repetitions": 3,
                          "exact_full_fact_parity": True,
                          "expected_fail_closed_fixtures": 5,
                          "median_ms": {n: statistics.median(v) for n,v in times.items()},
                          "production_equivalence_proven": False}))

if __name__ == "__main__":
    main()
