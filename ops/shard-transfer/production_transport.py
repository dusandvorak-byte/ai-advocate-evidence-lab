"""Exact same-run compact transport for fresh PDF audits.

The prepare job binds the complete PDF inventory, both registries and one
deterministic schedule to its output SHA. Each shard scans its actual assigned
bytes. Assembly independently recomputes the complete inventory from the full
tree; a missing/foreign/modified path cannot be accepted.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import zipfile
from transfer_plan import safe_path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops/shard-planning"))
sys.path.insert(0, str(ROOT / "scripts"))
from cost_planner import schedule, load_observations
from registry_pdf_fact_reuse import require_trusted_registry_reuse

HEX = re.compile(r"[0-9a-f]{64}")
SHA = re.compile(r"[0-9a-f]{40}")
COUNT = 16


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def file_sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def json_bytes(data):
    return (json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def trusted_identity():
    run = require_trusted_registry_reuse(os.environ)
    sha = os.environ.get("GITHUB_SHA", "")
    if not SHA.fullmatch(sha) or subprocess.check_output(
        ["git","rev-parse","HEAD"], cwd=ROOT, text=True).strip() != sha:
        raise ValueError("compact transport requires exact trusted main")
    return sha, run


def inventory(root):
    # Reuse the authoritative suffix/signature candidate detector, including
    # non-.pdf paths; never invent a second definition of publication PDFs.
    spec = importlib.util.spec_from_file_location("transport_audit", ROOT/"scripts/audit-release-evidence-2026-11-13.py")
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    rows = []
    for path in audit.publication_pdf_paths(root):
        rel = path.relative_to(root).as_posix()
        if not safe_path(rel) or path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("unsafe staged PDF")
        rows.append({"path":rel, "sha256":file_sha(path), "size":path.stat().st_size})
    return sorted(rows, key=lambda row: row["path"])


def assignment(rows, planner_dir=ROOT/"ops/shard-planning"):
    groups, paths = {}, set()
    for row in rows:
        rel, sha, size = row["path"], row["sha256"], row["size"]
        if (not safe_path(rel) or rel in paths or not isinstance(sha,str)
                or not HEX.fullmatch(sha) or type(size) is not int or size < 1):
            raise ValueError("invalid inventory entry")
        paths.add(rel)
        group = groups.setdefault(sha, {"size":size,"paths":[]})
        if group["size"] != size:
            raise ValueError("digest size conflict")
        group["paths"].append(rel)
    if not groups:
        raise ValueError("empty inventory")
    items = [(sha, g["size"]) for sha,g in groups.items()]
    hints = load_observations(planner_dir, items)
    bins, _ = schedule(items, COUNT, hints)
    if sorted(d for part in bins for d in part) != sorted(groups):
        raise ValueError("incomplete digest schedule")
    return [[{"sha256":d,"size":groups[d]["size"],
              "paths":sorted(groups[d]["paths"],key=lambda p:(p.lower(),p))}
             for d in part] for part in bins]


def make_manifest(stage, web_registry, canonical, sha, run):
    rows = inventory(stage)
    bins = assignment(rows)
    return {"schema":1,"checkout_commit":sha,"workflow_run_id":run,
            "rows":rows,"shards":bins,"web_registry_sha256":file_sha(web_registry),
            "canonical_registry_sha256":file_sha(canonical)}


def validate_manifest(raw, expected_sha, sha, run):
    if not HEX.fullmatch(expected_sha) or digest(raw) != expected_sha:
        raise ValueError("manifest digest mismatch")
    data = json.loads(raw)
    if (data.get("schema") != 1 or data.get("checkout_commit") != sha
            or data.get("workflow_run_id") != run or data["shards"] != assignment(data["rows"])):
        raise ValueError("manifest identity or assignment mismatch")
    return data


def write_bundles(stage, web_registry, canonical, output, sha, run):
    output.mkdir(parents=True,exist_ok=False)
    manifest = make_manifest(stage,web_registry,canonical,sha,run)
    raw = json_bytes(manifest)
    for index, groups in enumerate(manifest["shards"]):
        target = output/str(index)
        target.mkdir()
        (target/"manifest.json").write_bytes(raw)
        shutil.copyfile(web_registry,target/"web-registry.json")
        shutil.copyfile(canonical,target/"canonical-registry.json")
        with zipfile.ZipFile(target/"payload.zip","x",compression=zipfile.ZIP_DEFLATED) as z:
            for g in groups:
                path = stage/g["paths"][0]
                data = path.read_bytes()
                if len(data) != g["size"] or digest(data) != g["sha256"]:
                    raise ValueError("representative changed")
                info = zipfile.ZipInfo(g["sha256"]+".pdf")
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (stat.S_IFREG|0o600)<<16
                z.writestr(info,data)
    print(json.dumps({"event":"compact-shard-prepared","paths":len(manifest["rows"]),
                      "unique_digests":sum(map(len,manifest["shards"])),
                      "bundle_bytes":sum(p.stat().st_size for p in output.rglob("*") if p.is_file()),
                      "manifest_sha256":digest(raw)},sort_keys=True))
    return digest(raw)


def unpack_bundle(bundle, destination, expected_sha, sha, run, index):
    if type(index) is not int or not 0 <= index < COUNT:
        raise ValueError("invalid shard index")
    if set(p.name for p in bundle.iterdir()) != {"manifest.json","web-registry.json","canonical-registry.json","payload.zip"}:
        raise ValueError("unexpected bundle files")
    raw = (bundle/"manifest.json").read_bytes()
    manifest = validate_manifest(raw,expected_sha,sha,run)
    for name,key in (("web-registry.json","web_registry_sha256"),("canonical-registry.json","canonical_registry_sha256")):
        if file_sha(bundle/name) != manifest[key]:
            raise ValueError("registry identity mismatch")
    groups = manifest["shards"][index]
    required = {g["sha256"]+".pdf":g for g in groups}
    destination.mkdir(parents=True,exist_ok=False)
    with zipfile.ZipFile(bundle/"payload.zip") as z:
        members = z.infolist()
        names = [m.filename for m in members]
        if len(names) != len(set(names)) or set(names) != set(required):
            raise ValueError("inexact bundle members")
        for member in members:
            g = required[member.filename]
            if member.is_dir() or stat.S_ISLNK(member.external_attr>>16) or member.file_size != g["size"]:
                raise ValueError("invalid bundle member")
            with z.open(member) as f:
                data = f.read(g["size"]+1)
            if len(data) != g["size"] or digest(data) != g["sha256"]:
                raise ValueError("bundle byte mismatch")
            for rel in g["paths"]:
                dest = destination/rel
                if not dest.resolve().is_relative_to(destination.resolve()):
                    raise ValueError("invalid output path")
                dest.parent.mkdir(parents=True,exist_ok=True)
                with dest.open("xb") as f:
                    f.write(data)
    expected = sorted((p,g["sha256"],g["size"]) for g in groups for p in g["paths"])
    actual = sorted((r["path"],r["sha256"],r["size"]) for r in inventory(destination))
    if actual != expected:
        raise ValueError("restored subset differs from assigned inventory")
    return manifest


def validate_fragment_assignment(manifest, index, rows):
    expected = {p:g["sha256"] for g in manifest["shards"][index] for p in g["paths"]}
    actual = {}
    for row in rows:
        rel = row["published_path"]
        if rel in actual:
            raise ValueError("duplicate shard result")
        actual[rel] = row["sha256"]
    if actual != expected:
        raise ValueError("shard result differs from independently assigned full-tree inventory")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare","unpack"))
    parser.add_argument("directory",type=Path)
    parser.add_argument("--stage",type=Path,required=True)
    parser.add_argument("--index",type=int)
    args = parser.parse_args()
    sha,run = trusted_identity()
    if args.mode=="prepare":
        expected = write_bundles(args.stage,ROOT/"web/data/documents-2026.json",
                                 ROOT/"project-memory/documents-2026.json",args.directory,sha,run)
        with open(os.environ["GITHUB_OUTPUT"],"a") as f:
            f.write("manifest_sha256="+expected+"\n")
    else:
        unpack_bundle(args.directory,args.stage,os.environ["EVIDENCE_LAB_SHARD_MANIFEST_SHA256"],sha,run,args.index)


if __name__=="__main__":
    main()
