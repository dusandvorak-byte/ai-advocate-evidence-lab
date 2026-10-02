#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
REGISTRY = ROOT / "project-memory/documents-2026-supplement-2026-10-02-ekk-os-pro.json"

SPECS = [
    {
        "id": "doc-cz-ekk-2026-10-02-os-pro-procesni-dukazni-navrh",
        "source": ROOT / "project-memory/user-text-sources-2026-10-02/ekk-os-pro-procesni-dukazni-navrh.txt",
        "target": WEB / "documents/justice-slalom/2026-10/090-podani-2026-10-02-verejna-textova-kopie.pdf",
        "original_sha": "b697024e256b3f3d16fed31c6d0785248f3eec971fd366a00f139592fd00638f",
        "original_pages": 5,
        "title": "EKK – procesní a důkazní návrh – 2. října 2026",
    },
    {
        "id": "doc-cz-ekk-2026-10-02-dukazni-chronologie-kjl-2008-2026",
        "source": ROOT / "project-memory/user-text-sources-2026-10-02/dukazni-chronologie-kjl-2008-2026.txt",
        "target": WEB / "documents/justice-slalom/2026-10/091-priloha-dukazni-chronologie-2008-2026-verejna-textova-kopie.pdf",
        "original_sha": "6a54415e26fe4fc36e577329a7883382c656f5e3bcc9946d4f405c61fae26afe",
        "original_pages": 33,
        "title": "Důkazní chronologie Konopí je lék 2008–2026 – veřejná textová kopie",
    },
]

FONT_CANDIDATES = [
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
]

def find_font() -> Path:
    for path in FONT_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("Unicode font not found")

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def extract_pages(source: Path, expected_pages: int) -> list[str]:
    text = source.read_text("utf-8")
    pattern = re.compile(r"<PARSED TEXT FOR PAGE:\s*(\d+)\s*/\s*(\d+)>")
    matches = list(pattern.finditer(text))
    if len(matches) != expected_pages:
        raise SystemExit(f"{source}: expected {expected_pages} parsed page markers, found {len(matches)}")
    pages = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        page = text[start:end].strip()
        if not page:
            raise SystemExit(f"{source}: page {index + 1} has no extracted text")
        pages.append(page)
    return pages

def wrap_line(line: str, font: str, size: float, max_width: float) -> list[str]:
    line = line.replace("\t", "    ").rstrip()
    if not line:
        return [""]
    words = line.split(" ")
    output, current = [], ""
    for word in words:
        candidate = word if not current else current + " " + word
        if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
            current = candidate
            continue
        if current:
            output.append(current)
            current = ""
        if pdfmetrics.stringWidth(word, font, size) <= max_width:
            current = word
            continue
        fragment = ""
        for ch in word:
            candidate = fragment + ch
            if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
                fragment = candidate
            else:
                if fragment:
                    output.append(fragment)
                fragment = ch
        current = fragment
    if current:
        output.append(current)
    return output or [""]

def fit_page(page_text: str, font: str, usable_width: float, usable_height: float):
    for size in (6.8, 6.4, 6.0, 5.6, 5.2, 4.8, 4.5):
        leading = size * 1.22
        lines = []
        for raw in page_text.splitlines():
            lines.extend(wrap_line(raw, font, size, usable_width))
        capacity = int(usable_height // leading)
        if len(lines) <= capacity:
            return size, leading, lines
    raise SystemExit("A parsed source page cannot fit on one public-copy page without dropping text")

def build_pdf(spec: dict, font_path: Path) -> str:
    pages = extract_pages(spec["source"], spec["original_pages"])
    target = spec["target"]
    target.parent.mkdir(parents=True, exist_ok=True)
    font_name = "EvidenceUnicode"
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
    c = canvas.Canvas(str(target), pagesize=A4, pageCompression=1, invariant=1)
    c.setTitle(spec["title"])
    c.setAuthor("Evidence Lab – verified public text copy")
    width, height = A4
    left, right = 13 * mm, 13 * mm
    top, bottom = 18 * mm, 15 * mm
    header_gap = 9 * mm
    usable_width = width - left - right
    usable_height = height - top - bottom - header_gap
    short_sha = spec["original_sha"][:16]
    for page_no, page_text in enumerate(pages, 1):
        c.setFont(font_name, 7.0)
        c.drawString(left, height - 10 * mm, "OVĚŘENÁ VEŘEJNÁ TEXTOVÁ KOPIE")
        c.setFont(font_name, 5.6)
        c.drawRightString(width - right, height - 10 * mm, f"zdrojová strana {page_no}/{len(pages)} · originál SHA-256 {short_sha}…")
        c.setFont(font_name, 5.2)
        c.drawString(left, height - 14 * mm, "Kompletní extrahovaný text; grafická podoba a vložené obrazové scany originálu nejsou v této veřejné kopii reprodukovány.")
        c.line(left, height - 15.5 * mm, width - right, height - 15.5 * mm)

        size, leading, lines = fit_page(page_text, font_name, usable_width, usable_height)
        text_obj = c.beginText(left, height - top - header_gap)
        text_obj.setFont(font_name, size)
        text_obj.setLeading(leading)
        for line in lines:
            text_obj.textLine(line)
        c.drawText(text_obj)
        c.setFont(font_name, 5.5)
        c.drawRightString(width - right, 7 * mm, f"{page_no} / {len(pages)}")
        c.showPage()
    c.save()
    data = target.read_bytes()
    if data[:5] != b"%PDF-" or b"%%EOF" not in data[-2048:] or len(data) < 4000:
        raise SystemExit(f"Generated PDF integrity failure: {target}")
    return sha256(target)

def main():
    font_path = find_font()
    registry = json.loads(REGISTRY.read_text("utf-8"))
    docs = {item["id"]: item for item in registry.get("documents", [])}
    for spec in SPECS:
        item = docs.get(spec["id"])
        if not item:
            raise SystemExit(f"Missing registry item {spec['id']}")
        source_text = spec["source"].read_text("utf-8")
        if f"ORIGINAL_SHA256: {spec['original_sha']}" not in source_text:
            raise SystemExit(f"Original SHA provenance mismatch for {spec['id']}")
        digest = build_pdf(spec, font_path)
        rel = spec["target"].relative_to(WEB).as_posix()
        if item["public"].get("pdf") != rel:
            raise SystemExit(f"Public PDF path mismatch for {spec['id']}")
        item["public"]["sha256"] = digest
        item["public"]["verification_status"] = (
            "verified_text_public_copy_from_complete_extracted_text; "
            f"original_sha256={spec['original_sha']}; original_pages={spec['original_pages']}; "
            "not_byte_identical_original; graphical_scans_not_reproduced"
        )
        if item.get("justice_slalom"):
            item["justice_slalom"]["public_sha256"] = digest
        manifest = item["public"].get("public_copy_manifest") or item.get("justice_slalom", {}).get("public_copy_manifest")
        if manifest is not None:
            manifest["public_sha256"] = digest
        print(f"GENERATED {spec['id']} {rel} {digest}")
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", "utf-8")

if __name__ == "__main__":
    main()
