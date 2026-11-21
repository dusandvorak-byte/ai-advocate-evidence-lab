#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import os
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from typing import Callable

try:
    import resource
except ImportError:  # pragma: no cover - the production runner is POSIX
    resource = None

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
MAX_EXTRACTED_TEXT_BYTES = 8 * 1024 * 1024
MAX_POPPLER_MEMORY_BYTES = 256 * 1024 * 1024
MAX_NORMALIZED_PDF_BYTES = 128 * 1024 * 1024
MAX_NORMALIZER_MEMORY_BYTES = 768 * 1024 * 1024
NORMALIZER_TIMEOUT_SECONDS = 120
MAX_SOURCE_PAGES = 2000
POPPLER_RESOURCE_FAILURE = "Poppler extraction failed or exceeded its resource limit"
PDF_TRANSPORT_METHODS = ("qpdf", "mutool")
MUPDF_VARIANT_LABEL = "EXTRAKČNÍ VARIANTA A — MuPDF"
POPPLER_VARIANT_LABEL = "EXTRAKČNÍ VARIANTA B — Poppler"


class TextFallbackError(RuntimeError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    try:
        decoded = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise TextFallbackError("Poppler extraction did not produce valid UTF-8") from exc
    pages = decoded.split("\f")
    while pages and not pages[-1].strip():
        pages.pop()
    if len(pages) != page_count:
        raise TextFallbackError(
            f"Poppler extraction page count mismatch: expected {page_count}, got {len(pages)}"
        )
    return pages


def _set_poppler_resource_limits() -> None:
    if resource is None:
        return
    resource.setrlimit(
        resource.RLIMIT_FSIZE,
        (MAX_EXTRACTED_TEXT_BYTES, MAX_EXTRACTED_TEXT_BYTES),
    )
    if hasattr(resource, "RLIMIT_AS"):
        resource.setrlimit(
            resource.RLIMIT_AS,
            (MAX_POPPLER_MEMORY_BYTES, MAX_POPPLER_MEMORY_BYTES),
        )


def extract_poppler_pages(source: Path, page_count: int) -> list[str]:
    with tempfile.TemporaryFile(prefix="evidence-poppler-text-") as output:
        try:
            proc = subprocess.run(
                ["pdftotext", "-layout", "-enc", "UTF-8", str(source), "-"],
                stdout=output,
                stderr=subprocess.DEVNULL,
                timeout=60,
                check=False,
                preexec_fn=_set_poppler_resource_limits if os.name == "posix" else None,
            )
        except subprocess.TimeoutExpired as exc:
            raise TextFallbackError("Poppler extraction timed out") from exc
        except OSError as exc:
            raise TextFallbackError(f"Poppler extraction failed: {type(exc).__name__}") from exc

        output.flush()
        output.seek(0, os.SEEK_END)
        output_size = output.tell()
        if output_size > MAX_EXTRACTED_TEXT_BYTES:
            raise TextFallbackError("Poppler extraction byte limit exceeded")
        if proc.returncode != 0:
            raise TextFallbackError(POPPLER_RESOURCE_FAILURE)
        output.seek(0)
        raw = output.read(MAX_EXTRACTED_TEXT_BYTES + 1)
        if len(raw) > MAX_EXTRACTED_TEXT_BYTES:
            raise TextFallbackError("Poppler extraction byte limit exceeded")
    return split_poppler_pages(raw, page_count)



def _set_transport_resource_limits() -> None:
    if resource is None:
        return
    resource.setrlimit(
        resource.RLIMIT_FSIZE,
        (MAX_NORMALIZED_PDF_BYTES, MAX_NORMALIZED_PDF_BYTES),
    )
    if hasattr(resource, "RLIMIT_AS"):
        resource.setrlimit(
            resource.RLIMIT_AS,
            (MAX_NORMALIZER_MEMORY_BYTES, MAX_NORMALIZER_MEMORY_BYTES),
        )
    if hasattr(resource, "RLIMIT_CPU"):
        resource.setrlimit(resource.RLIMIT_CPU, (90, 90))


def _pdf_transport_command(method: str, source: Path, output: Path) -> list[str]:
    if method == "qpdf":
        return [
            "qpdf",
            "--warning-exit-0",
            "--deterministic-id",
            "--object-streams=generate",
            "--stream-data=compress",
            "--recompress-flate",
            str(source),
            str(output),
        ]
    if method == "mutool":
        return ["mutool", "clean", "-gggg", "-z", str(source), str(output)]
    raise ValueError(f"unsupported PDF transport method: {method}")


def _run_pdf_transport(method: str, source: Path, output: Path) -> bool:
    output.unlink(missing_ok=True)
    try:
        with tempfile.TemporaryFile(prefix="evidence-pdf-transport-log-") as log:
            proc = subprocess.run(
                _pdf_transport_command(method, source, output),
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=NORMALIZER_TIMEOUT_SECONDS,
                check=False,
                preexec_fn=_set_transport_resource_limits if os.name == "posix" else None,
            )
    except (OSError, subprocess.TimeoutExpired, ValueError):
        output.unlink(missing_ok=True)
        return False
    if proc.returncode != 0 or output.is_symlink() or not output.is_file():
        output.unlink(missing_ok=True)
        return False
    try:
        size = output.stat().st_size
    except OSError:
        output.unlink(missing_ok=True)
        return False
    if size < 1 or size > MAX_NORMALIZED_PDF_BYTES:
        output.unlink(missing_ok=True)
        return False
    return True


def _transport_semantics_match(
    normalized: Path,
    expected_identities: list[str],
    expected_sizes: list[tuple[float, float]],
    expected_page_count: int,
) -> bool:
    try:
        doc = fitz.open(normalized)
    except Exception:
        return False
    try:
        if doc.page_count != expected_page_count:
            return False
        identities: list[str] = []
        sizes: list[tuple[float, float]] = []
        for page in doc:
            identities.append(
                normalized_text_identity(clean_text(page.get_text("text", sort=True)))
            )
            sizes.append(
                (round(float(page.rect.width), 3), round(float(page.rect.height), 3))
            )
        return identities == expected_identities and sizes == expected_sizes
    except Exception:
        return False
    finally:
        doc.close()


def extract_poppler_pages_with_retry(
    source: Path,
    page_count: int,
    fitz_pages: list[str],
    sizes: list[tuple[float, float]],
) -> tuple[list[str], str | None]:
    try:
        return extract_poppler_pages(source, page_count), None
    except TextFallbackError as exc:
        if str(exc) != POPPLER_RESOURCE_FAILURE:
            raise

    expected_identities = [normalized_text_identity(clean_text(page)) for page in fitz_pages]
    expected_sizes = [
        (round(float(width), 3), round(float(height), 3))
        for width, height in sizes
    ]
    with tempfile.TemporaryDirectory(prefix="evidence-pdf-transport-") as tmp:
        root = Path(tmp)
        for method in PDF_TRANSPORT_METHODS:
            normalized = root / f"{method}.pdf"
            if not _run_pdf_transport(method, source, normalized):
                continue
            if not _transport_semantics_match(
                normalized,
                expected_identities,
                expected_sizes,
                page_count,
            ):
                continue
            try:
                pages = extract_poppler_pages(normalized, page_count)
            except TextFallbackError:
                continue
            return pages, method
    raise TextFallbackError(
        "Poppler extraction failed after bounded PDF transport retries"
    )


def atomic_replace_bytes(target: Path, data: bytes) -> None:
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_symlink():
        raise TextFallbackError("refusing to replace a symlink target")
    mode = (target.stat().st_mode & 0o777) if target.exists() else 0o644
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.",
        suffix=".tmp",
        dir=target.parent,
    )
    temporary = Path(temporary_name)
    fd_open = True
    try:
        with os.fdopen(fd, "wb") as handle:
            fd_open = False
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, target)
        directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        directory_fd = os.open(target.parent, directory_flags)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except Exception:
        if fd_open:
            os.close(fd)
        temporary.unlink(missing_ok=True)
        raise


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
        if page_count > MAX_SOURCE_PAGES:
            raise TextFallbackError("source PDF page-count limit exceeded")
        sizes: list[tuple[float, float]] = []
        fitz_pages: list[str] = []
        fitz_bytes = 0
        for page in doc:
            sizes.append((float(page.rect.width), float(page.rect.height)))
            page_text = clean_text(page.get_text("text", sort=True))
            fitz_bytes += len(page_text.encode("utf-8"))
            if fitz_bytes > MAX_EXTRACTED_TEXT_BYTES:
                raise TextFallbackError("MuPDF extraction byte limit exceeded")
            fitz_pages.append(page_text)
    finally:
        doc.close()

    poppler_pages, poppler_transport_retry = extract_poppler_pages_with_retry(
        source,
        page_count,
        fitz_pages,
        sizes,
    )

    selected: list[str] = []
    one_sided_pages: list[int] = []
    dual_extraction_pages: list[int] = []
    redaction_failure_pages: list[int] = []
    source_chars = 0
    public_chars = 0
    for index in range(page_count):
        fitz_text = clean_text(fitz_pages[index])
        poppler_text = clean_text(poppler_pages[index])
        fitz_identity = normalized_text_identity(fitz_text)
        poppler_identity = normalized_text_identity(poppler_text)
        if not fitz_identity or not poppler_identity:
            one_sided_pages.append(index + 1)
            continue

        if fitz_identity == poppler_identity:
            source_text = fitz_text
        elif fitz_identity in poppler_identity:
            source_text = poppler_text
        elif poppler_identity in fitz_identity:
            source_text = fitz_text
        else:
            dual_extraction_pages.append(index + 1)
            source_text = (
                f"{MUPDF_VARIANT_LABEL}\n{fitz_text}\n\n"
                f"{POPPLER_VARIANT_LABEL}\n{poppler_text}"
            )

        public_text = clean_text(redact_text(source_text))
        if forbidden_text(public_text):
            redaction_failure_pages.append(index + 1)
        source_chars += len(source_text)
        public_chars += len(public_text)
        selected.append(public_text)

    if one_sided_pages:
        raise TextFallbackError(
            "independent extractors did not both return nonempty page text: "
            + ",".join(map(str, one_sided_pages))
        )
    if redaction_failure_pages:
        raise TextFallbackError(
            "authenticated redaction left a forbidden identifier on pages: "
            + ",".join(map(str, redaction_failure_pages))
        )
    if len(selected) != page_count or source_chars == 0:
        raise TextFallbackError("source PDF contains no independently verified extractable text")

    facts = {
        "page_count": page_count,
        "poppler_ok": True,
        "poppler_transport_retry": poppler_transport_retry,
        "source_char_count": source_chars,
        "public_char_count": public_chars,
        "nonempty_page_count": sum(1 for page in selected if page.strip()),
        "one_sided_pages": one_sided_pages,
        "dual_extraction_pages": dual_extraction_pages,
        "dual_extraction_page_count": len(dual_extraction_pages),
        "redaction_failure_pages": redaction_failure_pages,
        "fitz_extracted_bytes": fitz_bytes,
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
    source_sha = sha256_file(source)
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
        atomic_replace_bytes(target, first_bytes)

    return {
        "source_sha256": source_sha,
        "output_sha256": sha256_bytes(first_bytes),
        "source_page_count": extraction["page_count"],
        "output_page_count": output_pages,
        "source_char_count": extraction["source_char_count"],
        "public_char_count": extraction["public_char_count"],
        "nonempty_page_count": extraction["nonempty_page_count"],
        "poppler_ok": extraction["poppler_ok"],
        "poppler_transport_retry": extraction["poppler_transport_retry"],
        "dual_extraction_page_count": extraction["dual_extraction_page_count"],
        "dual_extraction_pages": extraction["dual_extraction_pages"],
        "deterministic": True,
        "output_text_verified": True,
    }
