"""Isolated shard transfer manifest experiment, not publication authority.

Keep full tree and original independent assembly audit. This planner only
estimates transfer from byte-identical groups using verified file identities.
No archive extraction, downloading, or production workflow changes.
"""
import re
from pathlib import PurePosixPath

HEX = re.compile(r"[0-9a-f]{64}")


def safe_path(path):
    return (isinstance(path, str) and 0 < len(path) <= 1024
            and not path.startswith("/") and "\\" not in path
            and all(part not in ("", ".", "..", ".git") for part in path.split("/"))
            and all(32 <= ord(ch) != 127 for ch in path))


def plan(rows, shard_count):
    if type(shard_count) is not int or shard_count < 1:
        raise ValueError("invalid shard count")
    groups = {}
    seen = set()
    for row in rows:
        path, digest, size = row["path"], row["sha256"], row["size"]
        if not safe_path(path) or path in seen:
            raise ValueError("invalid or duplicate path")
        if not isinstance(digest, str) or not HEX.fullmatch(digest) or type(size) is not int or size < 1:
            raise ValueError("invalid PDF identity")
        seen.add(path)
        group = groups.setdefault(digest, {"sha256":digest,"size":size,"paths":[]})
        if group["size"] != size:
            raise ValueError("conflicting sizes for identical digest")
        group["paths"].append(path)
    if not groups:
        raise ValueError("empty PDF manifest")
    bins = [[] for _ in range(shard_count)]
    loads = [0]*shard_count
    for group in sorted(groups.values(), key=lambda g:(-g["size"],g["sha256"])):
        group["paths"].sort()
        group["representative"] = group["paths"][0]
        target = min(range(shard_count),key=lambda i:(loads[i],i))
        bins[target].append(group)
        loads[target] += group["size"]
    if sorted(p for shard in bins for g in shard for p in g["paths"]) != sorted(seen):
        raise ValueError("incomplete manifest")
    return {"shards":bins,"shard_payload_bytes":loads,"unique_pdf_count":len(groups),
            "pdf_path_count":len(seen),"representative_payload_bytes":sum(loads),
            "full_pdf_bytes_per_download":sum(g["size"]*len(g["paths"]) for g in groups.values()),
            "production_authoritative":False}


def compare_plan(candidate, rows, shard_count):
    """Reject any changed/omitted group or path in a candidate plan."""
    return candidate == plan(rows, shard_count)
