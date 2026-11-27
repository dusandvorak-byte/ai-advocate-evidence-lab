"""V3 baseline import: historical proof, never release authorization.

Only a pinned successful audit and the exact already published Git tree may
seed the archive. No private source bytes, policy literals or report text are
exported. A later delta publisher must independently validate current policy
and engine, review approvals and registry/chronology before any deployment.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from pdf_transform_snapshot import audit_index
from pdf_audit_ledger import safe_path, valid_digest

spec = importlib.util.spec_from_file_location("seed_fetch", ROOT / "scripts/fetch-benchmark-release.py")
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)

SOURCE = "c39727ec94acf2ce62a5a8e787a5b6ce07d8bb5a"
LIVE = "cfec9efdd31c21648e843aaa02f2ac5b63931960"
RUN = 45992881006
PINS = {
    "tree": (15194574613, "9223f95dc20785dc4d35e7c1cfc42085cfc2f1ece1bf07d0e911097c53f9f038"),
    "report": (15195084415, "286418b421b8d923c1d7eaef7cb09f275547c28354c2c0c48454fcdb8a21aa83"),
}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def inventory(root, *, git_checkout=False):
    require(root.is_dir() and not root.is_symlink(), "invalid archive root")
    result = {}
    for p in root.rglob("*"):
        rel = p.relative_to(root).as_posix()
        if git_checkout and rel.split("/")[0] == ".git":
            continue
        require(safe_path(rel) and not p.is_symlink(), "unsafe archive path")
        if p.is_dir():
            continue
        require(p.is_file() and stat.S_ISREG(p.stat().st_mode), "nonregular archive object")
        result[rel] = {"sha256": sha(p), "size": p.stat().st_size}
    require(result, "empty archive")
    return result

def git_inventory(root):
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    require(head == LIVE, "wrong historical published checkout")
    raw = subprocess.check_output(["git", "-C", str(root), "ls-tree", "-r", "-z", LIVE])
    rows = {}
    for line in raw.split(b"\0"):
        if not line:
            continue
        meta, name = line.split(b"\t", 1)
        mode, kind, oid = meta.decode().split()
        rel = name.decode("utf-8")
        require(safe_path(rel) and mode == "100644" and kind == "blob" and rel not in rows,
                "unexpected historical Git entry")
        path = root / rel
        require(path.is_file() and not path.is_symlink(), "published checkout missing blob")
        size = path.stat().st_size
        with path.open("rb") as stream:
            h = hashlib.sha1(("blob %d\0" % size).encode())
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                h.update(chunk)
        require(h.hexdigest() == oid, "published checkout differs from exact Git blob")
        rows[rel] = {"sha256": sha(path), "size": size}
    require(rows == inventory(root, git_checkout=True), "extra or missing published checkout paths")
    return rows

def compare_pdf_inventory(rows, final):
    pdfs = {p: v for p, v in rows.items() if p.lower().endswith(".pdf")}
    require(set(pdfs) == set(final), "published PDF path set differs from audit")
    for p, v in pdfs.items():
        require(v["sha256"] == final[p]["sha256"], "published PDF differs from audit")
    return {p: {"sha256": v["sha256"], "size": v["size"],
                "page_count": final[p]["page_count"]} for p, v in sorted(pdfs.items())}

def plan_delta(baseline, candidate):
    """Classify paths only; no result is an approval or a privacy decision."""
    before, after = set(baseline), set(candidate)
    changed = {p for p in before & after if baseline[p] != candidate[p]}
    return {"unchanged": sorted((before & after) - changed),
            "added": sorted(after - before), "changed": sorted(changed),
            "removed": sorted(before - after),
            "pdf_requiring_new_review": sorted(p for p in (after - before) | changed
                                               if p.lower().endswith(".pdf")),
            "publication_authorized": False}

def main(live, output):
    require(not output.exists(), "output already exists")
    published = git_inventory(live)
    with tempfile.TemporaryDirectory(prefix="v3-seed-") as tmp:
        root = Path(tmp)
        fetch.fetch(root, "seed", RUN, SOURCE, PINS)
        tree = root / "seed/tree"
        report = json.loads((root / "seed/report/release-evidence-audit.json").read_text())
        hard = report["privacy_hardening"]
        require(valid_digest(hard["policy_sha256"]) and
                valid_digest(hard["authenticated_private_policy_identity"]), "missing historical policy identity")
        require(json.loads((tree / "project-memory/privacy-hardening-report.json").read_text()) == hard,
                "historical hardening report mismatch")
        final, _ = audit_index(report, SOURCE, hard["policy_sha256"],
                               hard["authenticated_private_policy_identity"])
        stage = tree / "release-site"
        require(published == inventory(stage), "published Git tree differs from audited release tree")
        require(all((stage / p).read_text().strip() == SOURCE
                    for p in (".source-commit", "web/.source-commit")), "source marker mismatch")
        pdfs = compare_pdf_inventory(published, final)
        require(pdfs, "no audited public PDFs")
        # No private policy identity, raw audit text or identifiers are copied.
        # This is a historical archive record, not a current-policy cache hit.
        manifest = {"schema": 1, "scope": "historical-published-seed-only",
                    "published_commit": LIVE, "audited_source": SOURCE,
                    "audit_run": RUN, "artifact_sha256": {k: v[1] for k, v in PINS.items()},
                    "historical_public_policy_sha256": hard["policy_sha256"],
                    "publication_authorized": False, "current_policy_recheck_required": True,
                    "files": published, "pdfs": pdfs}
        output.write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")
        print(json.dumps({"event": "v3-published-seed-verified",
                          "files": len(published), "pdf_paths": len(pdfs),
                          "unique_pdf_sha256": len({v["sha256"] for v in pdfs.values()}),
                          "publication_authorized": False}))

if __name__ == "__main__":
    require(len(sys.argv) == 3, "usage: bootstrap.py EXACT_PUBLISHED_CHECKOUT OUTPUT_MANIFEST")
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
