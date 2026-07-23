#!/usr/bin/env python3
"""Create public, irreversibly redacted derivatives of the corrected filings."""

from __future__ import annotations

import argparse
from pathlib import Path

import fitz


NAME_REPLACEMENTS = {
    "Gabriela Foltová": "G. F.",
    "Gabriely Foltové": "G. F.",
    "Gabriele Foltové": "G. F.",
    "Gabrielu Foltovou": "G. F.",
    "Jan Kohout": "J. K.",
    "Jana Kohouta": "J. K.",
    "Janu Kohoutovi": "J. K.",
}


def intersects_any(rect: fitz.Rect, excluded: list[fitz.Rect]) -> bool:
    return any(rect.intersects(item) for item in excluded)


def redact_rect(
    page: fitz.Page,
    rect: fitz.Rect,
    replacements: list[tuple[fitz.Rect, str, float]],
    replacement: str | None = None,
    fontsize: float = 8.5,
) -> None:
    padded = fitz.Rect(rect.x0 - 0.8, rect.y0 - 0.8, rect.x1 + 0.8, rect.y1 + 0.8)
    page.add_redact_annot(padded, fill=(1, 1, 1))
    if replacement:
        replacements.append((padded, replacement, fontsize))


def redact_names(
    page: fitz.Page,
    replacements: list[tuple[fitz.Rect, str, float]],
    excluded: list[fitz.Rect],
) -> None:
    claimed: list[fitz.Rect] = []
    for source, replacement in sorted(
        NAME_REPLACEMENTS.items(), key=lambda pair: len(pair[0]), reverse=True
    ):
        hits = page.search_for(source)
        index = 0
        while index < len(hits):
            rect = hits[index]
            if intersects_any(rect, excluded) or intersects_any(rect, claimed):
                index += 1
                continue
            split_continuation = None
            if index + 1 < len(hits):
                candidate = hits[index + 1]
                if (
                    rect.x1 > page.rect.width - 75
                    and candidate.x0 < page.rect.width * 0.2
                    and 0 < candidate.y0 - rect.y0 < rect.height * 1.8
                ):
                    split_continuation = candidate
            redact_rect(
                page,
                rect,
                replacements,
                replacement=replacement,
                fontsize=min(9.0, max(6.5, rect.height * 0.78)),
            )
            claimed.append(rect)
            if split_continuation is not None:
                redact_rect(page, split_continuation, replacements)
                claimed.append(split_continuation)
                index += 1
            index += 1


def apply_replacements(
    page: fitz.Page, replacements: list[tuple[fitz.Rect, str, float]]
) -> None:
    page.apply_redactions()
    for rect, text, fontsize in replacements:
        page.insert_text(
            fitz.Point(rect.x0, rect.y1 - 1.0),
            text,
            fontname="helv",
            fontsize=fontsize,
            color=(0, 0, 0),
        )


def anonymize_complaint(source: Path, destination: Path) -> None:
    doc = fitz.open(source)
    for page in doc:
        replacements: list[tuple[fitz.Rect, str, float]] = []
        excluded: list[fitz.Rect] = []

        if page.number == 0:
            for name, replacement in (
                ("Gabriela Foltová", "G. F. (osobní údaje anonymizovány)"),
                ("Jan Kohout", "J. K. (osobní údaje anonymizovány)"),
            ):
                matches = page.search_for(name)
                if not matches:
                    raise RuntimeError(f"Header identity not found: {name}")
                name_rect = matches[0]
                row = fitz.Rect(name_rect.x0, name_rect.y0 - 1.2, page.rect.x1 - 44, name_rect.y1 + 1.2)
                redact_rect(page, row, replacements, replacement, fontsize=7.7)
                excluded.append(row)

        redact_names(page, replacements, excluded)
        apply_replacements(page, replacements)

    doc.set_metadata(
        {
            "title": "Anonymizovaná opravená stížnost - sp. zn. 15 T 11/2025",
            "author": "Veřejná anonymizovaná kopie",
            "subject": "Okresní soud v Ostravě, sp. zn. 15 T 11/2025",
            "keywords": "15 T 11/2025, anonymizovaná veřejná kopie",
            "creator": "CannaInsider.EU Evidence Lab",
            "producer": "PyMuPDF",
            "creationDate": "",
            "modDate": "",
        }
    )
    doc.del_xml_metadata()
    destination.parent.mkdir(parents=True, exist_ok=True)
    doc.save(destination, garbage=4, clean=True, deflate=True, no_new_id=True)
    doc.close()


def anonymize_supplement(source: Path, destination: Path) -> None:
    doc = fitz.open(source)
    for page in doc:
        replacements: list[tuple[fitz.Rect, str, float]] = []
        excluded: list[fitz.Rect] = []

        if page.number == 0:
            for name, replacement in (("Gabriela Foltová", "G. F."), ("Jan Kohout", "J. K.")):
                matches = page.search_for(name)
                if not matches:
                    raise RuntimeError(f"Header identity not found: {name}")
                name_rect = matches[0]
                row = fitz.Rect(name_rect.x0, name_rect.y0 - 1.2, page.rect.x1 - 56, name_rect.y1 + 1.2)
                redact_rect(page, row, replacements, replacement, fontsize=8.5)
                excluded.append(row)

            for birth_line in ("nar. 6. 7. 1981", "nar. 7. 4. 1988"):
                matches = page.search_for(birth_line)
                if not matches:
                    raise RuntimeError(f"Personal-data line not found: {birth_line}")
                start = matches[0]
                row = fitz.Rect(start.x0, start.y0 - 1.2, page.rect.x1 - 56, start.y1 + 1.2)
                redact_rect(page, row, replacements)
                excluded.append(row)

            for box_id in ("4nwapsn", "3aqapk2"):
                matches = page.search_for(box_id)
                if not matches:
                    raise RuntimeError(f"Data-box ID not found: {box_id}")
                hit = matches[0]
                row = fitz.Rect(238, hit.y0 - 1.2, page.rect.x1 - 56, hit.y1 + 1.2)
                redact_rect(page, row, replacements)
                excluded.append(row)

        redact_names(page, replacements, excluded)
        apply_replacements(page, replacements)

    doc.set_metadata(
        {
            "title": "Anonymizovaný dodatek stížnosti - sp. zn. 15 T 11/2025",
            "author": "Veřejná anonymizovaná kopie",
            "subject": "Okresní soud v Ostravě, sp. zn. 15 T 11/2025",
            "keywords": "15 T 11/2025, anonymizovaná veřejná kopie",
            "creator": "CannaInsider.EU Evidence Lab",
            "producer": "PyMuPDF",
            "creationDate": "",
            "modDate": "",
        }
    )
    doc.del_xml_metadata()
    destination.parent.mkdir(parents=True, exist_ok=True)
    doc.save(destination, garbage=4, clean=True, deflate=True, no_new_id=True)
    doc.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--complaint-source", type=Path, required=True)
    parser.add_argument("--supplement-source", type=Path, required=True)
    parser.add_argument("--documents-dir", type=Path, required=True)
    args = parser.parse_args()

    anonymize_complaint(
        args.complaint_source,
        args.documents_dir / "gf-jk-stiznost-15-t-11-2025-anonymizovano.pdf",
    )
    anonymize_supplement(
        args.supplement_source,
        args.documents_dir / "gf-jk-doplneni-stiznosti-2026-07-23-anonymizovano.pdf",
    )


if __name__ == "__main__":
    main()
