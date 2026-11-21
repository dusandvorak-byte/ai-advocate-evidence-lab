import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import public_text_fallback as fallback_module
from public_text_fallback import TextFallbackError, build_public_text_copy


class PublicTextFallbackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def make_pdf(
        self,
        path: Path,
        *,
        image_only_second_page: bool = False,
        annotation_only_second_page: bool = False,
        blank_second_page: bool = False,
    ) -> None:
        doc = fitz.open()
        first = doc.new_page()
        first.insert_text((72, 72), "Public SECRET value on page one")
        second = doc.new_page()
        if image_only_second_page:
            pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 20, 20), False)
            pix.clear_with(255)
            second.insert_image(fitz.Rect(72, 72, 172, 172), pixmap=pix)
        elif annotation_only_second_page:
            second.add_text_annot((72, 72), "Annotation-only visible content")
        elif not blank_second_page:
            second.insert_text((72, 72), "Second public page")
        doc.set_metadata({"author": "SECRET metadata", "subject": "/Users/private/path"})
        doc.save(path)
        doc.close()

    @staticmethod
    def redact(text: str) -> str:
        return text.replace("SECRET", "[REDACTED]")

    @staticmethod
    def forbidden(text: str) -> list[str]:
        return ["secret"] if "SECRET" in text else []

    def test_build_is_deterministic_clean_and_preserves_page_count(self):
        source = self.root / "source.pdf"
        first = self.root / "first.pdf"
        second = self.root / "second.pdf"
        self.make_pdf(source)
        source_sha = hashlib.sha256(source.read_bytes()).hexdigest()

        first_facts = build_public_text_copy(
            source,
            first,
            redact_text=self.redact,
            forbidden_text=self.forbidden,
        )
        second_facts = build_public_text_copy(
            source,
            second,
            redact_text=self.redact,
            forbidden_text=self.forbidden,
        )

        self.assertEqual(first.read_bytes(), second.read_bytes())
        self.assertEqual(first_facts["source_page_count"], 2)
        self.assertEqual(first_facts["output_page_count"], 2)
        self.assertEqual(first_facts["source_sha256"], source_sha)
        self.assertEqual(first_facts["output_sha256"], second_facts["output_sha256"])
        self.assertTrue(first_facts["output_text_verified"])
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), source_sha)

        out = fitz.open(first)
        try:
            text = "\n".join(page.get_text("text") for page in out)
            metadata = out.metadata or {}
        finally:
            out.close()
        self.assertNotIn("SECRET", text)
        self.assertIn("[REDACTED]", text)
        self.assertTrue(all(not metadata.get(field) for field in ("author", "subject", "keywords")))
        self.assertNotIn(b"SECRET metadata", first.read_bytes())
        self.assertNotIn(b"/Users/private/path", first.read_bytes())

    def assert_unextractable_page_fails(self, source: Path) -> None:
        target = self.root / "target.pdf"
        with self.assertRaises(TextFallbackError):
            build_public_text_copy(
                source,
                target,
                redact_text=self.redact,
                forbidden_text=self.forbidden,
            )
        self.assertFalse(target.exists())

    def test_image_only_page_fails_closed(self):
        source = self.root / "image-only.pdf"
        self.make_pdf(source, image_only_second_page=True)
        self.assert_unextractable_page_fails(source)

    def test_annotation_only_page_fails_closed(self):
        source = self.root / "annotation-only.pdf"
        self.make_pdf(source, annotation_only_second_page=True)
        self.assert_unextractable_page_fails(source)

    def test_blank_page_fails_closed_without_positive_blank_proof(self):
        source = self.root / "blank-page.pdf"
        self.make_pdf(source, blank_second_page=True)
        self.assert_unextractable_page_fails(source)

    def test_rendered_text_loss_fails_before_target_replacement(self):
        source = self.root / "source.pdf"
        target = self.root / "target.pdf"
        self.make_pdf(source)

        def render_blank(target_path, pages, sizes, *, font_path):
            doc = fitz.open()
            for width, height in sizes:
                doc.new_page(width=width, height=height)
            doc.save(target_path)
            doc.close()

        with mock.patch.object(fallback_module, "render_text_copy", side_effect=render_blank):
            with self.assertRaises(TextFallbackError):
                build_public_text_copy(
                    source,
                    target,
                    redact_text=self.redact,
                    forbidden_text=self.forbidden,
                )
        self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
