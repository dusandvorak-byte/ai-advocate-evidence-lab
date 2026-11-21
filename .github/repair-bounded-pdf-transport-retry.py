#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"unexpected {label} count: {count}")
    return text.replace(old, new)


def add_tests() -> None:
    path = Path("test/public_text_fallback.test.py")
    text = path.read_text("utf-8")
    anchor = "    def test_atomic_replace_failure_preserves_existing_target(self):\n"
    tests = '''    def test_qpdf_retry_recovers_generic_poppler_failure(self):
        source = self.root / "source.pdf"
        target = self.root / "target.pdf"
        self.make_pdf(source)
        pages = ["Public SECRET value on page one", "Second public page"]
        with mock.patch.object(
            fallback_module,
            "extract_poppler_pages",
            side_effect=[
                TextFallbackError(fallback_module.POPPLER_RESOURCE_FAILURE),
                pages,
            ],
        ) as extract, mock.patch.object(
            fallback_module, "_run_pdf_transport", return_value=True
        ) as transport, mock.patch.object(
            fallback_module, "_transport_semantics_match", return_value=True
        ):
            facts = build_public_text_copy(
                source,
                target,
                redact_text=self.redact,
                forbidden_text=self.forbidden,
            )
        self.assertEqual(facts["poppler_transport_retry"], "qpdf")
        self.assertEqual(extract.call_count, 2)
        self.assertEqual(transport.call_args_list[0].args[0], "qpdf")

    def test_mutool_retry_runs_after_qpdf_cannot_create_a_valid_transport(self):
        source = self.root / "source.pdf"
        target = self.root / "target.pdf"
        self.make_pdf(source)
        pages = ["Public SECRET value on page one", "Second public page"]
        with mock.patch.object(
            fallback_module,
            "extract_poppler_pages",
            side_effect=[
                TextFallbackError(fallback_module.POPPLER_RESOURCE_FAILURE),
                pages,
            ],
        ), mock.patch.object(
            fallback_module, "_run_pdf_transport", side_effect=[False, True]
        ) as transport, mock.patch.object(
            fallback_module, "_transport_semantics_match", return_value=True
        ):
            facts = build_public_text_copy(
                source,
                target,
                redact_text=self.redact,
                forbidden_text=self.forbidden,
            )
        self.assertEqual(facts["poppler_transport_retry"], "mutool")
        self.assertEqual(
            [call.args[0] for call in transport.call_args_list],
            ["qpdf", "mutool"],
        )

    def test_transport_semantic_mismatch_fails_closed(self):
        source = self.root / "source.pdf"
        target = self.root / "target.pdf"
        self.make_pdf(source)
        with mock.patch.object(
            fallback_module,
            "extract_poppler_pages",
            side_effect=TextFallbackError(fallback_module.POPPLER_RESOURCE_FAILURE),
        ) as extract, mock.patch.object(
            fallback_module, "_run_pdf_transport", return_value=True
        ) as transport, mock.patch.object(
            fallback_module, "_transport_semantics_match", return_value=False
        ):
            with self.assertRaisesRegex(TextFallbackError, "transport"):
                build_public_text_copy(
                    source,
                    target,
                    redact_text=self.redact,
                    forbidden_text=self.forbidden,
                )
        self.assertEqual(extract.call_count, 1)
        self.assertEqual(
            [call.args[0] for call in transport.call_args_list],
            ["qpdf", "mutool"],
        )
        self.assertFalse(target.exists())

    def test_nonretryable_poppler_error_never_runs_a_transport(self):
        source = self.root / "source.pdf"
        target = self.root / "target.pdf"
        self.make_pdf(source)
        with mock.patch.object(
            fallback_module,
            "extract_poppler_pages",
            side_effect=TextFallbackError("Poppler extraction timed out"),
        ), mock.patch.object(
            fallback_module, "_run_pdf_transport"
        ) as transport:
            with self.assertRaisesRegex(TextFallbackError, "timed out"):
                build_public_text_copy(
                    source,
                    target,
                    redact_text=self.redact,
                    forbidden_text=self.forbidden,
                )
        transport.assert_not_called()
        self.assertFalse(target.exists())

    def test_transport_commands_are_fixed_and_warning_tolerant_only_for_qpdf(self):
        source = self.root / "source.pdf"
        output = self.root / "normalized.pdf"
        qpdf = fallback_module._pdf_transport_command("qpdf", source, output)
        mutool = fallback_module._pdf_transport_command("mutool", source, output)
        self.assertEqual(qpdf[0], "qpdf")
        self.assertIn("--warning-exit-0", qpdf)
        self.assertEqual(qpdf[-2:], [str(source), str(output)])
        self.assertEqual(mutool[:4], ["mutool", "clean", "-gggg", "-z"])
        self.assertEqual(mutool[-2:], [str(source), str(output)])
        with self.assertRaises(ValueError):
            fallback_module._pdf_transport_command("ghostscript", source, output)

    def test_transport_output_size_limit_is_enforced(self):
        source = self.root / "source.pdf"
        output = self.root / "normalized.pdf"
        self.make_pdf(source)

        def oversized_transport(command, **kwargs):
            Path(command[-1]).write_bytes(b"X" * 17)
            return mock.Mock(returncode=0)

        with mock.patch.object(
            fallback_module, "MAX_NORMALIZED_PDF_BYTES", 16
        ), mock.patch.object(
            fallback_module.subprocess, "run", side_effect=oversized_transport
        ):
            self.assertFalse(
                fallback_module._run_pdf_transport("qpdf", source, output)
            )

    def test_transport_semantics_require_original_text_and_page_geometry(self):
        source = self.root / "source.pdf"
        self.make_pdf(source)
        doc = fitz.open(source)
        try:
            identities = [
                fallback_module.normalized_text_identity(
                    fallback_module.clean_text(page.get_text("text", sort=True))
                )
                for page in doc
            ]
            sizes = [
                (round(float(page.rect.width), 3), round(float(page.rect.height), 3))
                for page in doc
            ]
            page_count = doc.page_count
        finally:
            doc.close()
        self.assertTrue(
            fallback_module._transport_semantics_match(
                source, identities, sizes, page_count
            )
        )
        altered_sizes = list(sizes)
        altered_sizes[0] = (1.0, 1.0)
        self.assertFalse(
            fallback_module._transport_semantics_match(
                source, identities, altered_sizes, page_count
            )
        )

'''
    text = replace_once(text, anchor, tests + anchor, "test insertion anchor")
    path.write_text(text, "utf-8")


def implement() -> None:
    path = Path("scripts/public_text_fallback.py")
    text = path.read_text("utf-8")

    old_constants = "\n".join(
        [
            "MAX_EXTRACTED_TEXT_BYTES = 8 * 1024 * 1024",
            "MAX_POPPLER_MEMORY_BYTES = 256 * 1024 * 1024",
            "MAX_SOURCE_PAGES = 2000",
        ]
    )
    new_constants = "\n".join(
        [
            "MAX_EXTRACTED_TEXT_BYTES = 8 * 1024 * 1024",
            "MAX_POPPLER_MEMORY_BYTES = 256 * 1024 * 1024",
            "MAX_NORMALIZED_PDF_BYTES = 128 * 1024 * 1024",
            "MAX_NORMALIZER_MEMORY_BYTES = 768 * 1024 * 1024",
            "NORMALIZER_TIMEOUT_SECONDS = 120",
            "MAX_SOURCE_PAGES = 2000",
            'POPPLER_RESOURCE_FAILURE = "Poppler extraction failed or exceeded its resource limit"',
            'PDF_TRANSPORT_METHODS = ("qpdf", "mutool")',
        ]
    )
    text = replace_once(text, old_constants, new_constants, "constants anchor")

    old_hash = "def sha256_bytes(data: bytes) -> str:\n    return hashlib.sha256(data).hexdigest()\n"
    new_hash = '''def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
'''
    text = replace_once(text, old_hash, new_hash, "hash anchor")

    old_failure = '''        if proc.returncode != 0:
            raise TextFallbackError(
                "Poppler extraction failed or exceeded its resource limit"
            )'''
    new_failure = '''        if proc.returncode != 0:
            raise TextFallbackError(POPPLER_RESOURCE_FAILURE)'''
    text = replace_once(text, old_failure, new_failure, "Poppler failure anchor")

    insertion_anchor = "\n\ndef atomic_replace_bytes(target: Path, data: bytes) -> None:\n"
    transport_code = '''


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
'''
    text = replace_once(
        text,
        insertion_anchor,
        transport_code + insertion_anchor,
        "transport insertion anchor",
    )

    old_poppler_call = "    poppler_pages = extract_poppler_pages(source, page_count)\n"
    new_poppler_call = '''    poppler_pages, poppler_transport_retry = extract_poppler_pages_with_retry(
        source,
        page_count,
        fitz_pages,
        sizes,
    )
'''
    text = replace_once(text, old_poppler_call, new_poppler_call, "Poppler call anchor")

    text = replace_once(
        text,
        '        "poppler_ok": True,\n',
        '        "poppler_ok": True,\n        "poppler_transport_retry": poppler_transport_retry,\n',
        "extraction fact anchor",
    )
    text = replace_once(
        text,
        "    source_bytes = source.read_bytes()\n    source_sha = sha256_bytes(source_bytes)",
        "    source_sha = sha256_file(source)",
        "source SHA anchor",
    )
    text = replace_once(
        text,
        '        "poppler_ok": extraction["poppler_ok"],\n',
        '        "poppler_ok": extraction["poppler_ok"],\n        "poppler_transport_retry": extraction["poppler_transport_retry"],\n',
        "return fact anchor",
    )
    path.write_text(text, "utf-8")

    dependency_replacements = {
        Path(".github/workflows/public-text-fallback.yml"): (
            "sudo apt-get install -y -qq poppler-utils",
            "sudo apt-get install -y -qq mupdf-tools poppler-utils qpdf",
        ),
        Path(".github/workflows/validate-evidence-lab-2.yml"): (
            "sudo apt-get install -y -qq poppler-utils qpdf",
            "sudo apt-get install -y -qq mupdf-tools poppler-utils qpdf",
        ),
        Path(".github/workflows/trusted-pdf-shard-diagnostic.yml"): (
            "sudo apt-get install -y -qq poppler-utils qpdf",
            "sudo apt-get install -y -qq mupdf-tools poppler-utils qpdf",
        ),
    }
    for workflow, (old, new) in dependency_replacements.items():
        workflow_text = workflow.read_text("utf-8")
        count = workflow_text.count(old)
        if count < 1:
            raise SystemExit(f"missing dependency anchor in {workflow}: {old}")
        workflow.write_text(workflow_text.replace(old, new), "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "implementation"}:
        raise SystemExit("usage: repair-bounded-pdf-transport-retry.py tests|implementation")
    if sys.argv[1] == "tests":
        add_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
