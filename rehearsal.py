"""V3 isolated single-document publication rehearsal. Standard library only.

This intentionally cannot publish real documents or write production.
The fixture is a deterministic synthetic PDF, never an evidentiary document.
Historical baseline is independently verified, not a current-policy clearance.
"""
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import zipfile

REPO = "dusandvorak-byte/ai-advocate-evidence-lab"
BASE = "cfec9efdd31c21648e843aaa02f2ac5b63931960"
SOURCE = "c39727ec94acf2ce62a5a8e787a5b6ce07d8bb5a"
SEED_RUN = 46051881209
SEED_COMMIT = "3fe7c22e577c5c24ae9db9cefde80c17d5656abb"
SEED_ARTIFACT = 15224602514
SEED_DIGEST = "489657fab7163dbd8760c07fb6674cea933fd0d36c7f139ee281d7511f34b037"
SEED_NAME = "v3-historical-published-seed-" + SEED_COMMIT
FIXTURE = "v3-preview/documents/synthetic-test.pdf"
INDEX = "v3-preview/index.html"
METADATA = "v3-preview/data/documents.json"

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()

def safe_path(path):
    return isinstance(path, str) and "\\" not in path and all(
        p not in ("", ".", "..", ".git") for p in path.split("/")) and not any(
        ord(c) < 32 or ord(c) == 127 for c in path)

def inventory(root, *, checkout=False):
    require(root.is_dir() and not root.is_symlink(), "invalid root")
    rows = {}
    for p in root.rglob("*"):
        rel = p.relative_to(root).as_posix()
        if checkout and rel.split("/")[0] == ".git":
            continue
        require(safe_path(rel) and not p.is_symlink(), "unsafe path")
        if p.is_dir():
            continue
        require(stat.S_ISREG(p.stat().st_mode), "nonregular file")
        rows[rel] = {"sha256": sha(p), "size": p.stat().st_size}
    return rows

def api(suffix):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{suffix}"], timeout=45))

def retrieve_seed(tmp):
    run = api(f"actions/runs/{SEED_RUN}")
    require(run.get("head_sha") == SEED_COMMIT and run.get("head_branch") == "evidence-lab-v3/bootstrap"
            and run.get("path") == ".github/workflows/evidence-lab-v3-bootstrap.yml"
            and run.get("run_attempt") == 1 and run.get("event") == "push"
            and run.get("status") == "completed" and run.get("conclusion") == "success"
            and (run.get("repository") or {}).get("full_name") == REPO
            and (run.get("head_repository") or {}).get("full_name") == REPO, "untrusted seed run")
    listing = api(f"actions/runs/{SEED_RUN}/artifacts?per_page=100")
    rows = [r for r in listing.get("artifacts", []) if r.get("id") == SEED_ARTIFACT]
    require(len(rows) == 1 and rows[0].get("name") == SEED_NAME and rows[0].get("expired") is False
            and rows[0].get("digest") == "sha256:" + SEED_DIGEST, "untrusted seed artifact")
    archive = tmp / "seed.zip"
    with archive.open("xb") as f:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{SEED_ARTIFACT}/zip"],
                       stdout=f, check=True, timeout=60)
    require(archive.stat().st_size <= 2*1024*1024 and sha(archive) == SEED_DIGEST, "seed archive mismatch")
    with zipfile.ZipFile(archive) as z:
        members = z.infolist()
        require(len(members) == 1 and members[0].filename == "v3-seed.json"
                and members[0].file_size <= 4*1024*1024, "unexpected seed member")
        manifest = json.loads(z.read(members[0]))
    require(manifest.get("schema") == 1 and manifest.get("scope") == "historical-published-seed-only"
            and manifest.get("published_commit") == BASE and manifest.get("audited_source") == SOURCE
            and manifest.get("publication_authorized") is False
            and manifest.get("current_policy_recheck_required") is True, "invalid seed manifest")
    return manifest

def fixture_pdf():
    stream = b"BT /F1 14 Tf 50 750 Td (Synthetic V3 rehearsal - not evidence) Tj ET\n"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 6\n0000000000 65535 f \n"
    for off in offsets:
        out += ("%010d 00000 n \n" % off).encode()
    out += b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF\n"
    return bytes(out)

def build_preview(base, output, seed):
    require(not output.exists(), "candidate already exists")
    before = inventory(base, checkout=True)
    require(before == seed["files"], "historical baseline differs from verified manifest")
    pdfs = {p: v for p, v in before.items() if p.lower().endswith(".pdf")}
    require(set(pdfs) == set(seed["pdfs"]) and all(
        v["sha256"] == seed["pdfs"][p]["sha256"] for p, v in pdfs.items()), "seed PDF mismatch")
    require(not any(p.startswith("v3-preview/") for p in before), "preview path already used")
    # Overlay only. Never copy or re-generate historical PDF bytes into the delta.
    output.mkdir()
    pdf = output / FIXTURE
    pdf.parent.mkdir(parents=True)
    pdf.write_bytes(fixture_pdf())
    record = {"id": "synthetic-v3-rehearsal", "date": "2026-11-27",
              "title": "Synthetic V3 rehearsal - not evidence", "pdf": FIXTURE,
              "sha256": sha(pdf), "synthetic": True, "publication_authorized": False}
    meta = output / METADATA
    meta.parent.mkdir()
    meta.write_text(json.dumps({"documents": [record]}, indent=2) + "\n", encoding="utf-8")
    (output / INDEX).write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>V3 isolated rehearsal</title>'
        '<h1>V3 isolated rehearsal — NOT PUBLIC EVIDENCE</h1><p>2026-11-27</p>'
        '<a href="documents/synthetic-test.pdf">' + html.escape(record["title"]) +
        '</a><p>SHA-256: ' + record["sha256"] + '</p></html>', encoding="utf-8")
    delta = inventory(output)
    require(set(delta) == {FIXTURE, INDEX, METADATA} and not set(delta) & set(before), "unexpected delta")
    return {"event": "v3-single-document-preview", "baseline_paths": len(before),
            "baseline_pdf_paths": len(pdfs), "new_pdf_paths": 1, "delta_paths": len(delta),
            "delta_bytes": sum(v["size"] for v in delta.values()),
            "production_write": False, "publication_authorized": False}

def main():
    require(len(sys.argv) == 4, "usage: rehearsal.py BASELINE TEMP OUTPUT")
    started = time.monotonic()
    base, tmp, output = map(lambda s: Path(s).resolve(), sys.argv[1:])
    require(subprocess.check_output(["git", "-C", str(base), "rev-parse", "HEAD"], text=True).strip()
            == BASE, "wrong historical commit")
    seed = retrieve_seed(tmp)
    result = build_preview(base, output, seed)
    result["elapsed_seconds"] = round(time.monotonic() - started, 3)
    print(json.dumps(result, sort_keys=True))

if __name__ == "__main__":
    main()
