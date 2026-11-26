"""Measure actual compressed representative bundles for one pinned audited tree."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import zipfile
from bundle import build_bundle, read_bundle
from transfer_plan import plan, safe_path

SOURCE = "e1e1a5e517228d227a5b23635c2de3e865126c66"
TREE = "ddec331f49430e96595a0f5993797fcf9613801dd10be2d0501898f133772488"
REPORT = "4c96b309f5c593058414eb683259c0979d142618d1eab50478819a60c593dddf"


def check(path, expected):
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
            raise ValueError("pinned artifact digest mismatch")


def main():
    tree, report = map(Path, sys.argv[1:])
    check(tree, TREE)
    check(report, REPORT)
    with zipfile.ZipFile(report) as z:
        if z.namelist() != ["release-evidence-audit.json"]:
            raise ValueError("unexpected report contents")
        baseline = json.loads(z.read("release-evidence-audit.json"))
    summary = baseline["summary"]
    if (baseline["checkout_commit"] != SOURCE or baseline["schema_version"] != "1.1-sliced"
            or summary["hard_failure_count"] != 0 or summary["hard_failures"] != []
            or summary["staged_set_exact_match"] is not True
            or summary["id69_absent_from_final_release_state"] is not True
            or summary["human_content_privacy_review_still_required"] is not True):
        raise ValueError("invalid pinned audit")
    with tempfile.TemporaryDirectory(prefix="shard-transfer-measure-") as temp:
        root = Path(temp) / "tree"
        root.mkdir()
        rows = []
        with zipfile.ZipFile(tree) as z:
            names = z.namelist()
            if len(names) != len(set(names)):
                raise ValueError("duplicate tree archive members")
            for marker in ("release-site/.source-commit", "release-site/web/.source-commit"):
                if z.read(marker).decode().strip() != SOURCE:
                    raise ValueError("staged source mismatch")
            seen = set()
            for row in baseline["all_final_web_pdfs"]:
                rel, digest = row["published_path"], row["sha256"]
                if not safe_path(rel) or rel in seen:
                    raise ValueError("unsafe or duplicate report path")
                seen.add(rel)
                raw = z.read("release-site/" + rel)
                if hashlib.sha256(raw).hexdigest() != digest:
                    raise ValueError("staged PDF digest mismatch")
                dest = root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(raw)
                rows.append({"path": rel, "sha256": digest, "size": len(raw)})
        candidate = plan(rows, 16)
        if candidate["pdf_path_count"] != 818 or candidate["unique_pdf_count"] != 399:
            raise ValueError("unexpected pinned tree counts")
        results, sizes = [], []
        for i in range(16):
            path = Path(temp) / f"shard-{i}.zip"
            build_bundle(root, rows, 16, i, path)
            results.append(read_bundle(path, rows, 16, i))
            sizes.append(path.stat().st_size)
        if sum(r["verified_representatives"] for r in results) != 399:
            raise ValueError("representative count mismatch")
        if sum(r["verified_bytes"] for r in results) != candidate["representative_payload_bytes"]:
            raise ValueError("representative byte count mismatch")
        print(json.dumps({"event":"pinned-shard-bundle-measurement",
                          "source_commit":SOURCE, "pdf_paths":818, "unique_digests":399,
                          "verified_raw_bytes":candidate["representative_payload_bytes"],
                          "bundle_zip_bytes":sum(sizes), "max_bundle_zip_bytes":max(sizes),
                          "original_16_tree_zip_bytes":16*tree.stat().st_size,
                          "production_authoritative":False}, sort_keys=True))


if __name__ == "__main__":
    main()
