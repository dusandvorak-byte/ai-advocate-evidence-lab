"""Synthetic cross-runtime parser parity, not a production audit or release gate."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import fitz


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def generate(root):
    root.mkdir(exist_ok=False)
    for index in range(6):
        with fitz.open() as doc:
            for n in range(index + 1):
                page = doc.new_page()
                page.insert_text((50,50), f"Synthetic fixture {index}, page {n}")
                page.draw_rect(fitz.Rect(50,80,150,140), color=(0,0,0), fill=(0.2,0.5,0.8))
            if index == 4:
                doc.embfile_add("synthetic.txt", b"fixture only")
            if index == 5:
                doc.set_metadata({"author":"Synthetic author"})
            doc.save(root / f"{index}.pdf", garbage=4, deflate=True)


def run(args):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=30, check=False)


def inspect(root):
    rows = []
    for path in sorted(root.glob("*.pdf")):
        qpdf = run(["qpdf","--check",str(path)])
        text = run(["pdftotext","-layout",str(path),"-"])
        info = run(["pdfinfo",str(path)])
        if text.returncode or info.returncode:
            raise RuntimeError("synthetic fixture extraction failed")
        with fitz.open(path) as doc:
            rows.append({"name":path.name,"source_sha256":sha(path.read_bytes()),
                         "pages":doc.page_count,"embedded_files":doc.embfile_count(),
                         "author":doc.metadata.get("author"),"qpdf_exit":qpdf.returncode,
                         "pdftotext_sha256":sha(text.stdout),
                         "pymupdf_text_sha256":[sha(p.get_text().encode()) for p in doc],
                         "pixel_sha256":[sha(p.get_pixmap().samples) for p in doc]})
    if len(rows) != 6:
        raise ValueError("fixture set incomplete")
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("generate","inspect"))
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    if args.mode == "generate":
        generate(args.root)
    else:
        print(json.dumps(inspect(args.root), sort_keys=True))
