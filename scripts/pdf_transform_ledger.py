"""Persistent verified transformation store, isolated candidate reuse only.

This is a prototype for the expensive hardening phase. It deliberately
accepts only metadata/structural repairs with no text transformation.
It never stores the unredacted source. Authorization is not cached.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import tempfile

from pdf_audit_ledger import canonical, file_sha, valid_digest, valid_origin, safe_path, clean_facts

DOMAIN = b"evidence-lab/pdf-transform-ledger/v1\0"
STRATEGIES = {"qpdf_rewrite", "pymupdf_metadata", "pymupdf_rewrite"}
MAX_PDF_BYTES = 256 * 1024 * 1024
MAX_RECORD_BYTES = 256 * 1024
EXCLUDED = ("documents/okte-originaly-", "documents/originaly-2026-11-02/", "documents/interpelace-380-2018/")
EXCLUDED_ID69_SHA256 = "e73fcf803f59c4ed58cfb0ff01ee773cfedbd2782426132d3feeb715655d0ca2"


def context_digest(registry_rows, path_policy_digest):
    """Bind exact pre-hardening registry records and path-specific contracts."""
    if not isinstance(registry_rows, list) or not registry_rows or not valid_digest(path_policy_digest):
        raise ValueError("missing path policy or registry identity")
    if any(not isinstance(r, dict) or not r.get("id") or r.get("release_excluded") is True for r in registry_rows):
        raise ValueError("invalid registry context")
    return hashlib.sha256(canonical({"rows": registry_rows, "path_policy_sha256": path_policy_digest})).hexdigest()


def transform_key(rel, source_sha, policy_sha, identity, engine_sha, context_sha):
    if not safe_path(rel) or not rel.lower().endswith(".pdf") or not all(valid_digest(v) for v in (source_sha, policy_sha, identity, engine_sha, context_sha)):
        raise ValueError("invalid transformation identity")
    return hashlib.sha256(canonical([1, rel, source_sha, policy_sha, identity, engine_sha, context_sha])).hexdigest()


def eligible_proof(proof, source_sha, output_sha):
    if source_sha == output_sha or EXCLUDED_ID69_SHA256 in (source_sha, output_sha):
        return False
    if not isinstance(proof, dict) or set(proof) != {"strategy", "page_count", "changed", "matches", "text_fallback", "failures", "final_facts", "origin", "audit_report_sha256"}:
        return False
    if proof["strategy"] not in STRATEGIES or proof["changed"] is not True or proof["matches"] != [] or proof["text_fallback"] is not None or proof["failures"] != []:
        return False
    if not valid_origin(proof["origin"]) or not valid_digest(proof["audit_report_sha256"]):
        return False
    return (clean_facts(proof["final_facts"]) and type(proof["page_count"]) is int
            and proof["page_count"] == proof["final_facts"]["page_count"] and not proof["final_facts"]["xmp_present"])


class TransformLedger:
    """Private durable store; signed proofs and content-addressed public bytes."""
    def __init__(self, ledger):
        self.base = ledger
        self.records = ledger.root / "transforms"
        self.blobs = ledger.root / "public-pdf-blobs"
        for d in (self.records, self.blobs):
            d.mkdir(mode=0o700, exist_ok=True)
            if d.is_symlink() or not d.is_dir() or d.stat().st_mode & 0o077:
                raise ValueError("invalid private transform directory")

    def _mac(self, payload):
        return hmac.new(self.base.key, DOMAIN + canonical(payload), hashlib.sha256).hexdigest()

    def _write(self, target, data):
        fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".write-")
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp, target)
        finally:
            Path(tmp).unlink(missing_ok=True)

    def record(self, *, source_path, public_path, rel, policy_sha, identity, engine_sha, context_sha, proof):
        """Trusted caller must supply proof from a completed authoritative audit.

        This method validates the signed-store input shape; the production
        audit-to-proof issuer still needs independent review and integration.
        """
        if not safe_path(rel) or rel.startswith(EXCLUDED):
            return False
        source_sha = file_sha(source_path)
        output_sha = file_sha(public_path)
        if not eligible_proof(proof, source_sha, output_sha):
            return False
        if Path(public_path).stat().st_size > MAX_PDF_BYTES:
            return False
        data = Path(public_path).read_bytes()
        if (not data.startswith(b"%PDF-") or b"%%EOF" not in data[-4096:]
                or hashlib.sha256(data).hexdigest() != output_sha or file_sha(source_path) != source_sha):
            return False
        key = transform_key(rel, source_sha, policy_sha, identity, engine_sha, context_sha)
        payload = dict(schema=1, key=key, scope="machine-transform-only", rel=rel, source_sha256=source_sha,
                       public_sha256=output_sha, policy_sha256=policy_sha, private_policy_identity=identity,
                       engine_sha256=engine_sha, context_sha256=context_sha, proof=proof)
        raw = canonical({"payload": payload, "hmac_sha256": self._mac(payload)})
        if len(raw) > MAX_RECORD_BYTES:
            return False
        self._write(self.blobs / (output_sha + ".pdf"), data)
        self._write(self.records / (key + ".json"), raw)
        return True

    def lookup(self, *, source_path, rel, policy_sha, identity, engine_sha, context_sha):
        if not safe_path(rel) or rel.startswith(EXCLUDED):
            return None
        try:
            source_sha = file_sha(source_path)
            key = transform_key(rel, source_sha, policy_sha, identity, engine_sha, context_sha)
            path = self.records / (key + ".json")
            if path.is_symlink() or path.stat().st_size > MAX_RECORD_BYTES:
                return None
            env = json.loads(path.read_bytes())
            if set(env) != {"payload", "hmac_sha256"}:
                return None
            p = env["payload"]
            if not hmac.compare_digest(self._mac(p), env["hmac_sha256"]):
                return None
            expected = dict(schema=1, key=key, scope="machine-transform-only", rel=rel, source_sha256=source_sha,
                            policy_sha256=policy_sha, private_policy_identity=identity, engine_sha256=engine_sha,
                            context_sha256=context_sha)
            if set(p) != set(expected) | {"public_sha256", "proof"} or any(p[k] != v for k,v in expected.items()):
                return None
            digest = p["public_sha256"]
            if not valid_digest(digest) or not eligible_proof(p["proof"], source_sha, digest):
                return None
            blob = self.blobs / (digest + ".pdf")
            if blob.is_symlink() or blob.stat().st_size > MAX_PDF_BYTES or file_sha(blob) != digest:
                return None
            data = blob.read_bytes()
            if hashlib.sha256(data).hexdigest() != digest or file_sha(source_path) != source_sha:
                return None
            # Only return verified candidate bytes; never mutate production.
            return {"public_bytes": data, "proof": p["proof"], "public_sha256": digest,
                    "requires_final_audit": True, "authorization_granted": False}
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            return None
