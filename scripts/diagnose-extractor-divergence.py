#!/usr/bin/env python3
from __future__ import annotations

import collections
import difflib
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT = ROOT / "review-artifacts/extractor-divergence-diagnostic.json"
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from public_text_fallback import clean_text, normalized_text_identity, split_poppler_pages  # noqa: E402

TARGETS = [
    "documents/justice-slalom/2026-07/06-podani-2026-07-10.pdf",
    "documents/report-25072026-007/04-msz-podnet-2026-05-27.pdf",
    "documents/report-25072026-007/08-osz-prostejov-treti-zadost-2026-07-04.pdf",
    "documents/report-25072026-007/10-ksz-brno-vsz-olomouc-podnet-2026-07-10.pdf",
    "documents/report-27072026-008/14-ncoz-doplneni-2026-05-12.pdf",
    "documents/justice-slalom/2026-07/44-podani-2026-07-02.pdf",
    "documents/report-25072026-007/07-vsz-msz-praha-doplneni-2026-07-02.pdf",
]


def tokens(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.findall(r"[^\W_]+", normalized, flags=re.UNICODE)


def alnum_identity(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(char for char in normalized if char.isalnum())


def strip_marks(value: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", value).casefold()
        if not unicodedata.combining(char)
    )


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def multiset_overlap(left: list[str], right: list[str]) -> tuple[int, float, float]:
    left_counter = collections.Counter(left)
    right_counter = collections.Counter(right)
    overlap = sum((left_counter & right_counter).values())
    return (
        overlap,
        overlap / len(left) if left else 1.0,
        overlap / len(right) if right else 1.0,
    )


def expanded_difference(left: list[str], right: list[str]) -> list[str]:
    counter = collections.Counter(left) - collections.Counter(right)
    return sorted(token for token, count in counter.items() for _ in range(count))


def token_descriptor(token: str) -> dict:
    return {
        "sha256": digest(token),
        "length": len(token),
        "is_alpha": token.isalpha(),
        "is_digit": token.isdigit(),
        "is_ascii": token.isascii(),
    }


def levenshtein(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for i, lchar in enumerate(left, start=1):
        current = [i]
        for j, rchar in enumerate(right, start=1):
            current.append(min(
                current[-1] + 1,
                previous[j] + 1,
                previous[j - 1] + (lchar != rchar),
            ))
        previous = current
    return previous[-1]


def page_metrics(fitz_text: str, poppler_text: str, page_number: int) -> dict:
    fitz_identity = normalized_text_identity(fitz_text)
    poppler_identity = normalized_text_identity(poppler_text)
    fitz_tokens = tokens(fitz_text)
    poppler_tokens = tokens(poppler_text)
    overlap, fitz_coverage, poppler_coverage = multiset_overlap(fitz_tokens, poppler_tokens)
    fitz_counter = collections.Counter(fitz_tokens)
    poppler_counter = collections.Counter(poppler_tokens)
    sequence = difflib.SequenceMatcher(None, fitz_tokens, poppler_tokens, autojunk=False)
    sequence_ratio = sequence.ratio()
    fitz_alnum = alnum_identity(fitz_text)
    poppler_alnum = alnum_identity(poppler_text)
    shorter_identity, longer_identity = sorted((fitz_identity, poppler_identity), key=len)
    shorter_alnum, longer_alnum = sorted((fitz_alnum, poppler_alnum), key=len)
    fitz_only = expanded_difference(fitz_tokens, poppler_tokens)
    poppler_only = expanded_difference(poppler_tokens, fitz_tokens)
    fitz_unique_joined = "".join(fitz_only)
    poppler_unique_joined = "".join(poppler_only)
    opcodes = [
        {
            "tag": tag,
            "fitz_start": i1,
            "fitz_count": i2 - i1,
            "poppler_start": j1,
            "poppler_count": j2 - j1,
        }
        for tag, i1, i2, j1, j2 in sequence.get_opcodes()
        if tag != "equal"
    ]
    return {
        "page": page_number,
        "fitz_identity_length": len(fitz_identity),
        "poppler_identity_length": len(poppler_identity),
        "fitz_token_count": len(fitz_tokens),
        "poppler_token_count": len(poppler_tokens),
        "token_overlap_count": overlap,
        "fitz_token_coverage": round(fitz_coverage, 6),
        "poppler_token_coverage": round(poppler_coverage, 6),
        "sequence_ratio": round(sequence_ratio, 6),
        "fitz_only_token_occurrences": len(fitz_only),
        "poppler_only_token_occurrences": len(poppler_only),
        "identity_equal": fitz_identity == poppler_identity,
        "identity_containment": bool(shorter_identity and shorter_identity in longer_identity),
        "alnum_equal": fitz_alnum == poppler_alnum,
        "alnum_containment": bool(shorter_alnum and shorter_alnum in longer_alnum),
        "token_sequence_equal": fitz_tokens == poppler_tokens,
        "token_multiset_equal": fitz_counter == poppler_counter,
        "unique_join_equal": fitz_unique_joined == poppler_unique_joined,
        "unique_join_mark_stripped_equal": strip_marks(fitz_unique_joined) == strip_marks(poppler_unique_joined),
        "unique_join_levenshtein": levenshtein(fitz_unique_joined, poppler_unique_joined),
        "unique_join_sequence_ratio": round(
            difflib.SequenceMatcher(None, fitz_unique_joined, poppler_unique_joined, autojunk=False).ratio(),
            6,
        ),
        "fitz_only_tokens": [token_descriptor(token) for token in fitz_only],
        "poppler_only_tokens": [token_descriptor(token) for token in poppler_only],
        "diff_opcodes": opcodes,
        "fitz_identity_sha256": digest(fitz_identity),
        "poppler_identity_sha256": digest(poppler_identity),
    }


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    documents: list[dict] = []
    for rel in TARGETS:
        source = WEB / rel
        row: dict = {"path": rel, "exists": source.is_file()}
        if not source.is_file():
            row["status"] = "missing"
            documents.append(row)
            continue
        try:
            doc = fitz.open(source)
            try:
                page_count = doc.page_count
                fitz_pages = [clean_text(page.get_text("text", sort=True)) for page in doc]
            finally:
                doc.close()
            proc = subprocess.run(
                ["pdftotext", "-layout", "-enc", "UTF-8", str(source), "-"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=60,
                check=False,
            )
            poppler_ok = proc.returncode == 0
            poppler_pages = split_poppler_pages(proc.stdout, page_count) if poppler_ok else [""] * page_count
            pages = []
            for index in range(page_count):
                metrics = page_metrics(fitz_pages[index], clean_text(poppler_pages[index]), index + 1)
                if (
                    metrics["fitz_identity_length"] == 0
                    or metrics["poppler_identity_length"] == 0
                    or not metrics["identity_containment"]
                ):
                    pages.append(metrics)
            row.update({
                "status": "complete",
                "page_count": page_count,
                "poppler_ok": poppler_ok,
                "reported_page_count": len(pages),
                "pages": pages,
            })
        except Exception as exc:
            row.update({"status": "error", "error_type": type(exc).__name__})
        documents.append(row)

    summary = {
        "target_count": len(TARGETS),
        "complete_count": sum(1 for row in documents if row.get("status") == "complete"),
        "reported_page_count": sum(int(row.get("reported_page_count") or 0) for row in documents),
        "text_logged": False,
        "private_literals_logged": False,
    }
    payload = {
        "schema_version": "1.1",
        "purpose": "sanitized MuPDF/Poppler divergence characterization",
        "summary": summary,
        "documents": documents,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"summary": summary, "artifact": str(OUT.relative_to(ROOT))}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
