"""Synthetic parity of actual PDF machine audit, with an isolated fake policy.

Never uses real policy, real documents or production authorization.
"""
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
import fitz

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import publication_redaction as redaction
spec = importlib.util.spec_from_file_location("audit_fixture", ROOT / "scripts/audit-release-evidence-2026-11-13.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
TOKEN = "SYNTHETIC_PROTECTED_FIXTURE_XYZ"
KEY = "synthetic-only-not-production-key"


def generate(root):
    root.mkdir(exist_ok=False)
    for name in ("clean", "private-text", "private-metadata", "embedded", "trailing", "human-signal"):
        with fitz.open() as doc:
            p = doc.new_page()
            p.insert_text((50,50), TOKEN if name == "private-text" else
                          "fixture@example.invalid" if name == "human-signal" else "Synthetic document")
            if name == "private-metadata":
                doc.set_metadata({"author": TOKEN})
            if name == "embedded":
                doc.embfile_add("fixture.txt", b"synthetic embedded attachment")
            doc.save(root / (name + ".pdf"), garbage=4, deflate=True)
        if name == "trailing":
            with (root / (name + ".pdf")).open("ab") as out:
                out.write(b"synthetic trailing payload")


def inspect(root):
    policy = {"policy_id":"synthetic-fixture", "revision":1, "revision_token":"fixture-v1",
              "rules":[{"id":"fixture", "value":TOKEN, "replacement":"REMOVED"}],
              "forbidden":[{"value":TOKEN}]}
    contract = {k:policy[k] for k in ("policy_id","revision","revision_token")}
    contract.update(status="binding",private_policy_env="FIXTURE_POLICY_PATH",
                    hmac_key_env="FIXTURE_POLICY_KEY",hmac_algorithm="sha256",
                    approved_policy_hmac=hmac.new(KEY.encode(),redaction._canonical_private_policy_bytes(policy),hashlib.sha256).hexdigest())
    expected = {"clean":"NO_OBVIOUS_HIGH_RISK_PATTERN","human-signal":"FLAGGED_FOR_HUMAN_CONTENT_REVIEW",
                **{name:"FAIL_PRIVATE_OR_METADATA_CHANNEL" for name in ("private-text","private-metadata","embedded","trailing")}}
    paths = sorted(root.glob("*.pdf"))
    if {p.stem for p in paths} != set(expected):
        raise ValueError("unexpected fixture set")
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp)/"synthetic-policy.json"
        path.write_text(json.dumps(policy))
        with patch.object(redaction,"_load_contract",return_value=contract), patch.dict(os.environ,{"FIXTURE_POLICY_PATH":str(path),"FIXTURE_POLICY_KEY":KEY}):
            rows = []
            for pdf in paths:
                facts = audit._pdf_facts_uncached(pdf)
                if facts["machine_privacy_status"] != expected[pdf.stem]:
                    raise RuntimeError("unexpected fixture classification: "+pdf.stem)
                if facts["human_privacy_review_required"] is not True:
                    raise RuntimeError("human review flag lost")
                # The existing ledger also excludes diagnostic stderr from semantic equality.
                facts.pop("qpdf_check_tail",None)
                rows.append({"fixture":pdf.stem,"pdf_sha256":hashlib.sha256(pdf.read_bytes()).hexdigest(),"facts":facts})
            return rows


if __name__ == "__main__":
    if len(sys.argv)!=3 or sys.argv[1] not in ("generate","inspect"):
        raise SystemExit("usage: generate|inspect fixture_dir")
    root=Path(sys.argv[2])
    if sys.argv[1]=="generate":
        generate(root)
    else:
        print(json.dumps(inspect(root),sort_keys=True))
