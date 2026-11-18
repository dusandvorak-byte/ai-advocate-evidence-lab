from __future__ import annotations

import hashlib
import html
import json
import os
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "project-memory" / "verified-public-copy-sources-2026-09-16"
DEFAULT_OUT = (ROOT / "web" / "documents" / "report-04082026-010").resolve()
OUT = Path(os.environ.get("EVIDENCE_LAB_VERIFIED_COPY_OUT", str(DEFAULT_OUT))).resolve()
REGISTRY = ROOT / "project-memory" / "documents-2026.json"
SOURCE_2026_09_22 = ROOT / "project-memory" / "verified-public-copy-sources-2026-09-22"
SOURCE_2026_09_23 = ROOT / "project-memory" / "verified-public-copy-sources-2026-09-23"
SOURCE_2026_08_27 = ROOT / "project-memory" / "verified-public-copy-sources-2026-08-27"

JOBS = {
    "89-ms-praha-8-ad-9-2026-89.txt": "89-ms-praha-8-ad-9-2026-89-2026-09-09.pdf",
    "91-os-prostejov-15-nt-3106-2026.txt": "91-os-prostejov-15-nt-3106-2026-2026-09-14.pdf",
    "92-ms-praha-9-ad-12-2026-7.txt": "92-ms-praha-9-ad-12-2026-7-2026-09-14.pdf",
    "93-mv-139593-3-tp-2026.txt": "93-mv-139593-3-tp-2026-2026-09-14.pdf",
    "94-vsz-olomouc-3-vzn-239-2026-64.txt": "94-vsz-olomouc-3-vzn-239-2026-64-2026-09-15.pdf",
    "95-dvorak-ks-ksz-vsz-doplneni-stiznosti.txt": "95-dvorak-9-to-315-2026-9-to-316-2026-3-vzn-239-2026-1-kzt-475-2026-1-kzn-1079-2026-2026-09-13.pdf",
}

EXTRA_JOBS = {
    SOURCE_2026_09_22 / "97-ms-praha-15-ad-14-2026-12.txt": "97-ms-praha-15-ad-14-2026-12-2026-09-22-verejna-kopie.pdf",
    SOURCE_2026_09_23 / "98-ms-praha-18-a-23-2026-182.txt": "98-ms-praha-18-a-23-2026-182-2026-09-23-verejna-kopie.pdf",
    SOURCE_2026_09_23 / "99-ms-praha-18-a-17-2026-182.txt": "99-ms-praha-18-a-17-2026-182-2026-09-23-verejna-kopie.pdf",
    SOURCE_2026_08_27 / "100-msp-19-2026-odka-roz-26.txt": "100-msp-19-2026-odka-roz-26-2026-08-27-verejna-kopie.pdf",
}

font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
font_bold_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
if not font_path.exists() or not font_bold_path.exists():
    raise SystemExit("DejaVu Sans is required to materialize verified Czech PDF copies")

pdfmetrics.registerFont(TTFont("DejaVu", str(font_path)))
pdfmetrics.registerFont(TTFont("DejaVuBold", str(font_bold_path)))

styles = getSampleStyleSheet()
body = ParagraphStyle(
    "BodyCZ", parent=styles["BodyText"], fontName="DejaVu", fontSize=9.2,
    leading=12.2, spaceAfter=4.5, allowWidows=1, allowOrphans=1,
)
heading = ParagraphStyle(
    "HeadingCZ", parent=body, fontName="DejaVuBold", fontSize=11.5,
    leading=14.0, spaceBefore=6, spaceAfter=6,
)
notice = ParagraphStyle(
    "NoticeCZ", parent=body, fontName="DejaVuBold", fontSize=8.7,
    leading=11.2, spaceAfter=5,
)

OUT.mkdir(parents=True, exist_ok=True)

def deterministic_canvas(*args, **kwargs):
    kwargs["invariant"] = 1
    return Canvas(*args, **kwargs)

all_jobs = [(SOURCE / source_name, out_name) for source_name, out_name in JOBS.items()]
all_jobs.extend(EXTRA_JOBS.items())

generated_sha256 = {}

for source_path, out_name in all_jobs:
    if not source_path.exists():
        raise SystemExit(f"Missing verified text source: {source_path}")
    text = source_path.read_text(encoding="utf-8").replace("\f", "\n")
    lines = text.splitlines()
    story = []
    for idx, raw in enumerate(lines):
        line = raw.strip()
        if not line:
            story.append(Spacer(1, 3.5 * mm))
            continue
        escaped = html.escape(line).replace("•", "&#8226;")
        if idx <= 3 or line.isupper() or line.startswith(("I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.", "IX.", "X.")):
            style = notice if idx <= 3 else heading
        else:
            style = body
        story.append(Paragraph(escaped, style))

    target = OUT / out_name
    doc = SimpleDocTemplate(
        str(target), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=17 * mm, bottomMargin=17 * mm,
        title=lines[0] if lines else out_name,
        author="Evidence Lab - verified public copy",
        subject="Verified public copy from complete text output of user-supplied PDF",
    )
    doc.build(story, canvasmaker=deterministic_canvas)
    data = target.read_bytes()
    if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
        raise SystemExit(f"Invalid generated PDF: {target}")
    try:
        display_path = target.relative_to(ROOT)
    except ValueError:
        display_path = target
    generated_sha256[out_name] = hashlib.sha256(data).hexdigest()
    print(f"materialized {display_path} ({len(data)} bytes)")

# Only the normal canonical web materialization may refresh the working registry.
# Isolated provenance rebuilds use EVIDENCE_LAB_VERIFIED_COPY_OUT outside DEFAULT_OUT
# and must never mutate canonical metadata.
if OUT == DEFAULT_OUT:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    canonical_prefix = "documents/report-04082026-010/"
    owned_paths = {
        canonical_prefix + out_name: sha
        for out_name, sha in generated_sha256.items()
    }
    matched_paths = set()
    for path, sha in owned_paths.items():
        owners = []
        for item in registry.get("documents", []):
            public = item.get("public") or {}
            if str(public.get("pdf") or "") == path:
                owners.append(item)
        if not owners:
            # Some generator outputs are intentionally non-canonical derivatives
            # (for example the historical 95-* copy). They must not block the
            # canonical registry sync and must never claim ownership implicitly.
            continue
        if len(owners) != 1:
            raise SystemExit(f"Canonical generated PDF path has {len(owners)} owners: {path}")
        public = owners[0].get("public") or {}
        public["sha256"] = sha
        owners[0]["public"] = public
        matched_paths.add(path)
    tmp = REGISTRY.with_suffix(REGISTRY.suffix + ".tmp")
    tmp.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(REGISTRY)
    print(f"updated canonical registry SHA for {len(matched_paths)} generated public PDFs")
