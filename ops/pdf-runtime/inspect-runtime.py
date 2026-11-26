#!/usr/bin/env python3
"""Read-only inventory of a candidate PDF runtime. No production authorization.

The observed dependency list is a minimum compatibility baseline, not an
approved lock. A complete immutable runtime must additionally pin its image,
signed OS closure, wheel hashes and the existing engine fingerprint.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
import stat
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = ("qpdf", "pdftotext", "pdfinfo", "mutool")
SHA = re.compile(r"^[0-9a-f]{64}$")


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def command(argv):
    return subprocess.check_output(argv, stderr=subprocess.STDOUT, timeout=30, text=True,
                                   env={**os.environ, "LC_ALL": "C"}).strip()


def file_sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def payload_digest(paths):
    """Hash actual installed files, not just package metadata.

    Missing or unsupported payloads fail closed. Directory entries are
    represented without recursively reading unrelated directory contents.
    """
    entries = {}
    for value in paths:
        path = Path(os.path.abspath(value))
        key = str(path)
        if key in entries:
            continue
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode):
            target = path.resolve(strict=True)
            if target.is_file():
                entries[key] = ["symlink", os.readlink(path), file_sha(target)]
            elif target.is_dir():
                entries[key] = ["symlink-directory", os.readlink(path)]
            else:
                raise ValueError("unsupported installed link target")
        elif stat.S_ISREG(mode):
            entries[key] = ["file", file_sha(path)]
        elif stat.S_ISDIR(mode):
            entries[key] = ["directory"]
        else:
            raise ValueError("unsupported installed payload")
    if not entries:
        raise ValueError("empty installed payload")
    return digest(entries)


def parse_dpkg_list(output):
    """Recognize documented blank separators and diversion descriptions.

    Diversions are retained in the inventory and their paths are examined,
    not silently discarded. Unknown output remains a hard diagnostic error.
    """
    paths = []
    diversions = []
    pattern = re.compile(r"^(?:local )?diversion of (/.*?) to (/.*?)(?: by ([a-z0-9][a-z0-9+.:~-]*))?$")
    for line in output.splitlines():
        if not line.strip():
            continue
        if line.startswith("/"):
            paths.append(line)
            continue
        match = pattern.fullmatch(line)
        if not match:
            raise ValueError("unexpected installed OS payload record: " + repr(line[:240]))
        original, diverted, owner = match.groups()
        diversions.append([original, diverted, owner])
        # Include existing endpoints. The exact diversion record binds the
        # absent endpoints; ordinary package paths still fail if missing.
        paths.extend(p for p in (original, diverted) if os.path.lexists(p))
    return paths, diversions


def inventory():
    packages = {}
    for line in command(["dpkg-query", "-W", "-f=${binary:Package}\t${Version}\n"]).splitlines():
        name, version = line.split("\t")
        if name in packages:
            raise ValueError("duplicate OS package")
        packages[name] = version
    os_paths = []
    names = sorted(packages)
    diversions = []
    for i in range(0, len(names), 100):
        paths, records = parse_dpkg_list(command(["dpkg-query", "-L", *names[i:i+100]]))
        os_paths.extend(paths)
        diversions.extend(records)
    os_payload = digest({"payload": payload_digest(os_paths),
                         "diversions": sorted(set(tuple(row) for row in diversions), key=str)})
    distributions = {}
    for dist in importlib.metadata.distributions():
        name = normalize(dist.metadata["Name"])
        record = dist.read_text("RECORD")
        if not record or name in distributions:
            raise ValueError("missing RECORD or duplicate Python distribution")
        if not dist.files:
            raise ValueError("missing Python payload manifest")
        distributions[name] = {"version": dist.version, "record_sha256": hashlib.sha256(record.encode()).hexdigest(),
                               "payload_sha256": payload_digest(dist.locate_file(p) for p in dist.files)}
    tools = {}
    for name in TOOLS:
        path = shutil.which(name)
        if path is None:
            raise ValueError("missing tool " + name)
        tools[name] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if not packages or not distributions:
        raise ValueError("empty runtime closure")
    return {"schema": 1, "python": platform.python_version(),
            "python_binary_sha256": hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest(),
            "os_packages": packages, "os_payload_sha256": os_payload, "python_distributions": distributions,
            "tools": tools}


def validate_observed(actual, expected):
    mismatches = []
    if actual["python"] != expected["python"]:
        mismatches.append("python")
    for name, version in expected["apt"].items():
        if actual["os_packages"].get(name) != version:
            mismatches.append("apt:" + name)
    for name, version in expected["python_distributions"].items():
        if actual["python_distributions"].get(normalize(name), {}).get("version") != version:
            mismatches.append("python:" + name)
    return sorted(mismatches)


def validate_exact(actual, locked):
    """Equality only; a matching inventory is not proof of trusted provenance."""
    if set(actual) != {"schema", "python", "python_binary_sha256", "os_packages", "os_payload_sha256", "python_distributions", "tools"}:
        return False
    if actual["schema"] != 1 or not SHA.fullmatch(actual["python_binary_sha256"]) or not SHA.fullmatch(actual["os_payload_sha256"]):
        return False
    if set(actual["tools"]) != set(TOOLS) or not all(SHA.fullmatch(v) for v in actual["tools"].values()):
        return False
    if not actual["os_packages"] or not actual["python_distributions"]:
        return False
    for row in actual["python_distributions"].values():
        if set(row) != {"version", "record_sha256", "payload_sha256"} or not SHA.fullmatch(row["record_sha256"]) or not SHA.fullmatch(row["payload_sha256"]):
            return False
    return actual == locked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory-out", type=Path, required=True)
    parser.add_argument("--compare", type=Path, help="previous independently obtained inventory")
    args = parser.parse_args()
    expected = json.loads((HERE / "observed-dependencies.json").read_text())
    actual = inventory()
    mismatches = validate_observed(actual, expected)
    same = None if args.compare is None else validate_exact(actual, json.loads(args.compare.read_text()))
    with args.inventory_out.open("x", encoding="utf-8") as out:
        json.dump(actual, out, sort_keys=True, indent=2)
        out.write("\n")
    print(json.dumps({"observed_version_mismatches": mismatches, "inventory_sha256": digest(actual),
                      "exact_inventory_match": same, "production_authorization": False}))
    return 1 if mismatches or same is False else 0


if __name__ == "__main__":
    sys.exit(main())
