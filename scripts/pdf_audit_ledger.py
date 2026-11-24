"""Authenticated, content-addressed PDF audit ledger (not release authorization).

The storage directory is private, outside the checkout and the published tree.
A dedicated signing key must be supplied by a trusted runner, never a PR.
A cache miss or damaged entry must trigger a fresh audit. Only machine-clean
facts are eligible; human review and all path/registry/release checks remain.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import tempfile

SCHEMA = 1
DOMAIN = b"evidence-lab/pdf-audit-ledger/v1\0"
HEX = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
MAX_ENTRY = 256 * 1024
MAX_PDF = 256 * 1024 * 1024
# Fail closed on an added or omitted fact field. Free-form diagnostic tails
# are deliberately not persisted. No page text, metadata values or secrets.
FACT_FIELDS = frozenset("""
page_count pdf_header_offset non_whitespace_prefix_before_pdf_header
pdf_eof_present pdf_eof_count pdf_startxref_count pdf_startxref_offsets_unique
pdf_startxref_targets_valid pdf_revision_markers_bound pdf_single_revision_only
qpdf_structurally_valid non_whitespace_suffix_after_pdf_eof metadata_keys_present
embedded_file_count file_attachment_annotation_count associated_file_reference_count
embedded_file_object_count suspicious_metadata_keys xmp_present xmp_suspicious
xmp_known_private_identifier_hits content_privacy_signals machine_privacy_status
human_privacy_review_required known_private_identifier_hits
decoded_object_private_identifier_hits decoded_stream_scan_ok inline_image_stream_count
text_extraction_engines public_copy_notice_present not_byte_identical_notice_present
""".split())
TRUE_FIELDS = ("pdf_eof_present", "pdf_startxref_offsets_unique",
               "pdf_startxref_targets_valid", "pdf_revision_markers_bound",
               "pdf_single_revision_only", "qpdf_structurally_valid",
               "decoded_stream_scan_ok", "human_privacy_review_required")
FALSE_FIELDS = ("non_whitespace_prefix_before_pdf_header",
                "non_whitespace_suffix_after_pdf_eof", "xmp_suspicious")
ZERO_FIELDS = ("embedded_file_count", "file_attachment_annotation_count",
               "associated_file_reference_count", "embedded_file_object_count",
               "inline_image_stream_count")
EMPTY_FIELDS = ("suspicious_metadata_keys", "xmp_known_private_identifier_hits",
                "known_private_identifier_hits", "decoded_object_private_identifier_hits")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def valid_digest(value):
    return isinstance(value, str) and HEX.fullmatch(value) is not None


def strict_int(value, minimum=0):
    return type(value) is int and value >= minimum


def safe_path(value):
    return (isinstance(value, str) and len(value) <= 1024 and "\\" not in value
            and all(p not in ("", ".", "..", ".git") for p in value.split("/"))
            and all(ord(c) >= 32 and ord(c) != 127 for c in value))


def clean_facts(facts):
    if not isinstance(facts, dict) or set(facts) != FACT_FIELDS:
        return False
    if not strict_int(facts["page_count"], 1) or not strict_int(facts["pdf_header_offset"]):
        return False
    if any(facts[k] is not True for k in TRUE_FIELDS) or any(facts[k] is not False for k in FALSE_FIELDS):
        return False
    if any(type(facts[k]) is not int or facts[k] != 0 for k in ZERO_FIELDS):
        return False
    if any(facts[k] != [] for k in EMPTY_FIELDS):
        return False
    if any(type(facts[k]) is not int or facts[k] != 1 for k in ("pdf_eof_count", "pdf_startxref_count")):
        return False
    if any(type(facts[k]) is not bool for k in ("xmp_present", "public_copy_notice_present", "not_byte_identical_notice_present")):
        return False
    if facts["text_extraction_engines"] != ["qpdf/qdf", "PyMuPDF", "pdftotext/poppler"]:
        return False
    keys = facts["metadata_keys_present"]
    if not isinstance(keys, list) or any(not isinstance(k, str) or k not in {
        "format", "title", "author", "subject", "keywords", "creator", "producer",
        "creationDate", "modDate", "trapped", "encryption"} for k in keys):
        return False
    signals = facts["content_privacy_signals"]
    if not isinstance(signals, dict) or set(signals) != {"email_like_count", "czech_birth_number_like_count", "phone_like_count"} or not all(strict_int(v) for v in signals.values()):
        return False
    return facts["machine_privacy_status"] == ("FLAGGED_FOR_HUMAN_CONTENT_REVIEW" if any(signals.values()) else "NO_OBVIOUS_HIGH_RISK_PATTERN")


def clean_projection(facts):
    # Reject unknown fields instead of silently discarding new security checks.
    if not isinstance(facts, dict) or set(facts) - FACT_FIELDS != {"qpdf_check_tail"}:
        return None
    projected = {k: facts[k] for k in FACT_FIELDS if k in facts}
    return projected if clean_facts(projected) else None


def cache_key(pdf_sha, policy_sha, private_policy_identity, engine_sha):
    if not all(valid_digest(x) for x in (pdf_sha, policy_sha, private_policy_identity, engine_sha)):
        raise ValueError("invalid audit identity")
    # Facts are byte-derived; no path-based approval is cached.
    return sha(canonical([SCHEMA, pdf_sha, policy_sha, private_policy_identity, engine_sha]))


def file_sha(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):
            raise ValueError("nonregular audit input")
        return hashlib.file_digest(f, "sha256").hexdigest()


class Ledger:
    def __init__(self, directory, signing_key, checkout):
        self.root = Path(directory).resolve()
        self.checkout = Path(checkout).resolve()
        if self.root == self.checkout or self.root.is_relative_to(self.checkout) or self.checkout.is_relative_to(self.root):
            raise ValueError("ledger must be separate from checkout and public tree")
        if not isinstance(signing_key, bytes) or len(signing_key) < 32:
            raise ValueError("dedicated signing key must contain at least 32 bytes")
        self.key = signing_key
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.root.stat().st_mode & 0o077:
            raise ValueError("ledger directory must be private")
        self.entries = self.root / "entries"
        self.entries.mkdir(mode=0o700, exist_ok=True)
        if self.entries.is_symlink() or not self.entries.is_dir() or self.entries.stat().st_mode & 0o077:
            raise ValueError("invalid ledger entries directory")

    def _mac(self, payload):
        return hmac.new(self.key, DOMAIN + canonical(payload), hashlib.sha256).hexdigest()

    def _entry(self, key):
        if not valid_digest(key):
            raise ValueError("invalid entry key")
        return self.entries / (key + ".json")

    def lookup(self, *, pdf_path, policy_sha, private_policy_identity, engine_sha):
        try:
            digest = file_sha(pdf_path)
            key = cache_key(digest, policy_sha, private_policy_identity, engine_sha)
            fd = os.open(self._entry(key), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            with os.fdopen(fd, "rb") as f:
                info = os.fstat(f.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_ENTRY:
                    return None
                envelope = json.loads(f.read(MAX_ENTRY + 1))
            if set(envelope) != {"payload", "hmac_sha256"}:
                return None
            payload = envelope["payload"]
            if not hmac.compare_digest(self._mac(payload), envelope["hmac_sha256"]):
                return None
            if set(payload) != {"schema", "key", "pdf_sha256", "policy_sha256", "private_policy_identity",
                                "engine_sha256", "origin", "facts", "scope"}:
                return None
            if (payload["schema"] != SCHEMA or payload["scope"] != "machine-facts-only"
                or payload["key"] != key or payload["pdf_sha256"] != digest
                or payload["policy_sha256"] != policy_sha or payload["private_policy_identity"] != private_policy_identity
                or payload["engine_sha256"] != engine_sha or not valid_origin(payload["origin"])
                or not clean_facts(payload["facts"]) or file_sha(pdf_path) != digest):
                return None
            # Diagnostic tail is not a security input. Consumers may not infer
            # approval from this machine-only result.
            return {**payload["facts"], "qpdf_check_tail": "", "human_privacy_review_required": True}
        except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError):
            return None

    def record(self, *, pdf_path, expected_pdf_sha, policy_sha, private_policy_identity,
               engine_sha, facts, origin):
        """Only called after a fresh, trusted, full-machine scan, not on hits."""
        projected = clean_projection(facts)
        if projected is None or not valid_origin(origin) or file_sha(pdf_path) != expected_pdf_sha:
            return False
        key = cache_key(expected_pdf_sha, policy_sha, private_policy_identity, engine_sha)
        payload = dict(schema=SCHEMA, key=key, pdf_sha256=expected_pdf_sha, policy_sha256=policy_sha,
                       private_policy_identity=private_policy_identity, engine_sha256=engine_sha,
                       origin=origin, facts=projected, scope="machine-facts-only")
        raw = canonical({"payload": payload, "hmac_sha256": self._mac(payload)})
        if len(raw) > MAX_ENTRY:
            return False
        fd, name = tempfile.mkstemp(prefix=".entry-", dir=self.entries)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
            # Replace atomically, never follow a destination symlink.
            os.replace(name, self._entry(key))
        finally:
            Path(name).unlink(missing_ok=True)
        return True


def valid_origin(origin):
    return (isinstance(origin, dict) and set(origin) == {"repository", "workflow", "run_id", "run_attempt", "source_commit"}
            and origin["repository"] == "dusandvorak-byte/ai-advocate-evidence-lab"
            and origin["workflow"] == ".github/workflows/trusted-pdf-shard-diagnostic.yml"
            and strict_int(origin["run_id"], 1) and strict_int(origin["run_attempt"], 1)
            and isinstance(origin["source_commit"], str) and COMMIT.fullmatch(origin["source_commit"]) is not None)
