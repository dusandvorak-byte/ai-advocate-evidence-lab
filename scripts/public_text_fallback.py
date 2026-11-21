#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from typing import Callable

import fitz
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepInFrame, Paragraph, Spacer

FONT_NAME = "EvidenceFallbackUnicode"
FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
)


class TextFallbackError(RuntimeError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def find_font() -> Path:
    for candidate in FONT_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise TextFallbackError("Unicode font unavailable")


def clean_text(value: str) -> str:
    return "".join(
        char if char in "\n\t" or ord(char) >= 32 else " "
        for char in value
    )


def normalized_text_identity(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return "".join(
        char
        for char in normalized
        if not char.isspace() and char not in {"\u00ad", "\u200b", "\ufeff"}
    )


def split_poppler_pages(raw: bytes, page_count: int) -> list[str]:
    pages = raw.decode("utf-8", errors="ignore").split("\f")
    while pages and not pages[-1].strip():
        pages.pop()
    if len(pages) < page_count:
        pages.extend([""] * (page_count - len(pages)))
    return pages[:page_count]


def extract_complete_page_text(
    source: Path,
    *,
    redact_text: Callable[[str], str],
    forbidden_text: Callable[[str], list[str]],
) -> tuple[list[str], list[tuple[float, float]], dict]:
    try:
        doc = fitz.open(source)
    except Exception as exc:
        raise TextFallbackError(f"source PDF cannot be opened: {type(exc).__name__}") from exc
    try:
        page_count = doc.page_count
        if page_count < 1:
            raise TextFallbackError("source PDF has no pages")
        sizes = [(float(page.rect.width), float(page.rect.height)) for page in doc]
        fitz_pages = [clean_text(page.get_text("text", sort=True)) for page in doc]
    finally:
        doc.close()

    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(source), "-"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=60,
        )
        poppler_ok = proc.returncode == 0
        poppler_pages = split_poppler_pages(proc.stdout, page_count) if poppler_ok else [""] * page_count
    except (OSError, subprocess.TimeoutExpired):
        poppler_ok = False
        poppler_pages = [""] * page_count

    selected: list[str] = []
    unextractable_pages: list[int] = []
    divergent_extractor_pages: list[int] = []
    redaction_failure_pages: list[int] = []
    source_chars = 0
    public_chars = 0
    for index in range(page_count):
        fitz_text = clean_text(fitz_pages[index])
        poppler_text = clean_text(poppler_pages[index])
        fitz_identity = normalized_text_identity(fitz_text)
        poppler_identity = normalized_text_identity(poppler_text)
        if fitz_identity and poppler_identity:
            shorter, longer = sorted(
                (fitz_identity, poppler_identity),
                key=len,
            )
            if shorter not in longer:
                divergent_extractor_pages.append(index + 1)
        candidates = [fitz_text, poppler_text]
        source_text = max(candidates, key=lambda item: len(normalized_text_identity(item)))
        if not source_text.strip():
            unextractable_pages.append(index + 1)
        public_text = clean_text(redact_text(source_text))
        if forbidden_text(public_text):
            redaction_failure_pages.append(index + 1)
        source_chars += len(source_text)
        public_chars += len(public_text)
        selected.append(public_text)

    if divergent_extractor_pages:
        raise TextFallbackError(
            "MuPDF and Poppler text extraction materially diverged on pages: "
            + ",".join(map(str, divergent_extractor_pages))
        )
    if unextractable_pages:
        raise TextFallbackError(
            "pages without positively verified extractable text cannot be published as a complete public text copy: "
            + ",".join(map(str, unextractable_pages))
        )
    if redaction_failure_pages:
        raise TextFallbackError(
            "authenticated redaction left a forbidden identifier on pages: "
            + ",".join(map(str, redaction_failure_pages))
        )
    if source_chars == 0:
        raise TextFallbackError("source PDF contains no extractable text")

    facts = {
        "page_count": page_count,
        "poppler_ok": poppler_ok,
        "source_char_count": source_chars,
        "public_char_count": public_chars,
        "nonempty_page_count": sum(1 for page in selected if page.strip()),
        "unextractable_pages": unextractable_pages,
        "divergent_extractor_pages": divergent_extractor_pages,
        "redaction_failure_pages": redaction_failure_pages,
    }
    return selected, sizes, facts


def render_text_copy(
    target: Path,
    pages: list[str],
    sizes: list[tuple[float, float]],
    *,
    font_path: Path,
) -> None:
    if len(pages) != len(sizes) or not pages:
        raise TextFallbackError("page text and page-size inventories do not match")
    if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(font_path)))

    pdf = canvas.Canvas(
        str(target),
        pagesize=sizes[0],
        pageCompression=1,
        invariant=1,
    )
    pdf.setTitle("Evidence Lab – ověřená veřejná textová kopie")
    pdf.setAuthor("")
    pdf.setSubject("")
    pdf.setKeywords("")
    pdf.setCreator("Evidence Lab deterministic public text fallback")

    for index, (text, size) in enumerate(zip(pages, sizes), start=1):
        width, height = size
        if width <= 0 or height <= 0:
            raise TextFallbackError(f"invalid source page size at page {index}")
        pdf.setPageSize((width, height))
        margin = max(18.0, min(width, height) * 0.035)
        available_width = max(36.0, width - 2 * margin)
        available_height = max(36.0, height - 2 * margin)
        header_style = ParagraphStyle(
            "fallback-header",
            fontName=FONT_NAME,
            fontSize=7.2,
            leading=8.6,
            spaceAfter=4,
        )
        body_style = ParagraphStyle(
            "fallback-body",
            fontName=FONT_NAME,
            fontSize=7.0,
            leading=8.4,
            splitLongWords=True,
        )
        safe = html.escape(text).replace("\n", "<br/>")
        story = [
            Paragraph(
                "OVĚŘENÁ VEŘEJNÁ TEXTOVÁ KOPIE — "
                f"strana {index}/{len(pages)}. Grafická úprava, podpisy a metadata originálu nejsou reprodukovány.",
                header_style,
            ),
            Spacer(1, 5),
            Paragraph(safe, body_style),
        ]
        frame = KeepInFrame(
            available_width,
            available_height,
            story,
            mode="shrink",
            mergeSpace=True,
        )
        frame.wrapOn(pdf, available_width, available_height)
        frame.drawOn(pdf, margin, margin)
        pdf.showPage()
    pdf.save()


def build_public_text_copy(
    source: Path,
    target: Path,
    *,
    redact_text: Callable[[str], str],
    forbidden_text: Callable[[str], list[str]],
) -> dict:
    source = Path(source)
    target = Path(target)
    if not source.is_file():
        raise TextFallbackError("source PDF does not exist")
    source_bytes = source.read_bytes()
    source_sha = sha256_bytes(source_bytes)
    pages, sizes, extraction = extract_complete_page_text(
        source,
        redact_text=redact_text,
        forbidden_text=forbidden_text,
    )
    font_path = find_font()

    with tempfile.TemporaryDirectory(prefix="evidence-public-text-") as tmp:
        first = Path(tmp) / "first.pdf"
        second = Path(tmp) / "second.pdf"
        render_text_copy(first, pages, sizes, font_path=font_path)
        render_text_copy(second, pages, sizes, font_path=font_path)
        first_bytes = first.read_bytes()
        second_bytes = second.read_bytes()
        if first_bytes != second_bytes:
            raise TextFallbackError("public text copy rendering is not deterministic")
        try:
            rebuilt = fitz.open(first)
        except Exception as exc:
            raise TextFallbackError(f"generated public copy cannot be opened: {type(exc).__name__}") from exc
        try:
            output_pages = rebuilt.page_count
            rendered_pages = [clean_text(page.get_text("text", sort=True)) for page in rebuilt]
        finally:
            rebuilt.close()
        if output_pages != extraction["page_count"]:
            raise TextFallbackError(
                f"page count changed during public text fallback: {extraction['page_count']}->{output_pages}"
            )
        for index, (expected, rendered) in enumerate(zip(pages, rendered_pages), start=1):
            expected_identity = normalized_text_identity(expected)
            rendered_identity = normalized_text_identity(rendered)
            if not expected_identity or expected_identity not in rendered_identity:
                raise TextFallbackError(
                    f"rendered public text copy lost or altered page text at page {index}"
                )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(first_bytes)

    return {
        "source_sha256": source_sha,
        "output_sha256": sha256_bytes(first_bytes),
        "source_page_count": extraction["page_count"],
        "output_page_count": output_pages,
        "source_char_count": extraction["source_char_count"],
        "public_char_count": extraction["public_char_count"],
        "nonempty_page_count": extraction["nonempty_page_count"],
        "poppler_ok": extraction["poppler_ok"],
        "deterministic": True,
        "output_text_verified": True,
    }
