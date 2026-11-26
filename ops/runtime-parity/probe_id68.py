"""Read-only diagnostic: isolate the ID68 rebuild font contribution.

Run only inside the reviewed trusted runtime job, against the authenticated
historical checkout/report. Never change the expected rebuild digest.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import zlib
from compare_stage import validate_baseline

SOURCE_SHA = "d4bf0b612f294b7f54dc626efd0afba1583323c8"
TRANSCRIPT_SHA = "141f60f5f6c77fbffaf236ee9746c917db611d4072d20dbba6e31b89d33c8876"
NAME = "68-krpt-priloha-rr-ku-54-2021-priloha-1.pdf"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--font", type=Path)
    args = parser.parse_args()
    if not (os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("GITHUB_EVENT_NAME") == "push"
            and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_REPOSITORY") == "dusandvorak-byte/ai-advocate-evidence-lab"):
        raise ValueError("ID68 probe requires trusted main push")
    checkout = args.checkout.resolve(strict=True)
    baseline = json.loads(args.baseline.read_text())
    validate_baseline(baseline, SOURCE_SHA)
    rows = [r for r in baseline["generated_public_derivatives"]
            if r.get("output") == "web/documents/report-04082026-010/" + NAME]
    if len(rows) != 1:
        raise ValueError("missing exact ID68 baseline row")
    expected = rows[0]["id68_rebuilt_sha256"]
    sys.path.insert(0, str(checkout / "scripts"))
    renderer = runpy.run_path(str(checkout / "scripts/materialize-godot-state-text-pdfs.py"))
    sources = renderer["SOURCES"][NAME]
    if len(sources) != 1 or sha(sources[0]) != TRANSCRIPT_SHA:
        raise ValueError("ID68 transcript mismatch")
    if args.font is not None:
        renderer["find_font"].__globals__["FONT_CANDIDATES"] = [args.font.resolve(strict=True)]
    font = renderer["find_font"]()
    renderer["register_state_font"]()
    with tempfile.TemporaryDirectory(prefix="id68-font-probe-") as directory:
        target = Path(directory) / NAME
        renderer["make_pdf"](target, sources)
        import reportlab
        print(json.dumps({"event": "id68-font-probe",
                          "font_variant": "host-comparison" if args.font else "candidate-default",
                          "font_sha256": sha(font),
                          "reportlab_version": reportlab.Version,
                          "zlib_runtime": zlib.ZLIB_RUNTIME_VERSION,
                          "rebuilt_matches_pinned_baseline": sha(target) == expected,
                          "production_authorization": False}, sort_keys=True))


if __name__ == "__main__":
    main()
