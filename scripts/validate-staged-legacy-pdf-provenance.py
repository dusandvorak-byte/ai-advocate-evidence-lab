"""Keep historical SHA-256 source pins while checking the exact audited output."""
import json
import sys
from collections import defaultdict
from pathlib import Path

from provenance_hardening_bridge import sha256_file, verify_hardening_bridge


def validate_pins(pins, audit, stage):
    rows = defaultdict(list)
    for row in audit["all_final_web_pdfs"]:
        rows[row["published_path"]].append(row)
    hardening = audit["privacy_hardening"]
    evidence = defaultdict(list)
    for row in hardening["documents"]:
        evidence[row["public_path"]].append(row)

    for rel, source_sha in pins.items():
        if len(rows[rel]) != 1:
            raise ValueError(f"expected one audited PDF for {rel}")
        row = rows[rel][0]
        output = stage / rel
        final_sha = row["sha256"]
        if not row["checks"] or not all(result is True for result in row["checks"].values()):
            raise ValueError(f"final PDF audit failed for {rel}")
        if sha256_file(output) != final_sha:
            raise ValueError(f"staged PDF differs from audited bytes for {rel}")
        if final_sha == source_sha:
            continue
        if len(evidence[rel]) != 1:
            raise ValueError(f"expected one hardening record for {rel}")
        proof = evidence[rel][0]
        if (
            proof.get("changed") is not True
            or proof.get("registered") is not True
            or not proof.get("id")
            or proof["id"] not in row["registry_ids"]
            or proof.get("known_private_identifier_hits_after") != []
            or proof.get("decoded_private_identifier_hits_after") != []
            or not verify_hardening_bridge(
                hardening_report=hardening,
                hardening_row=proof,
                document_id=proof["id"],
                public_path=rel,
                input_sha256=source_sha,
                expected_output_sha256=final_sha,
                final_public_pdf=output,
            )
        ):
            raise ValueError(f"staged PDF lacks verified provenance from the pinned source for {rel}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    pins = json.loads((root / "project-memory/legacy-live-pdf-source-sha.json").read_text("utf-8"))
    report = json.loads(Path(sys.argv[1]).read_text("utf-8"))
    validate_pins(pins, report, Path(sys.argv[2]))
    print(f"Verified pinned source provenance and audited output for {len(pins)} PDFs.")
