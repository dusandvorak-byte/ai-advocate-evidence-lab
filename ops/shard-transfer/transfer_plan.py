"""Isolated shard transfer manifest experiment, not publication authority.

Keep full tree and original independent assembly audit. This planner only
estimates transfer from byte-identical groups using verified file identities.
No archive extraction, downloading, or production workflow changes.
"""
import hashlib
import re

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



def verify_payload(candidate, rows, shard_count, shard_index, payloads):
    """Check a representative bundle against an independently derived plan.

    The caller supplies already-read bytes keyed by SHA-256, never archive
    paths. Reject missing, extra, malformed or changed representatives.
    A verified bundle is not a verified publication: the full tree must
    still be independently rehashed and reconciled during assembly.
    """
    if type(shard_index) is not int or not 0 <= shard_index < shard_count:
        raise ValueError("invalid shard index")
    expected = plan(rows, shard_count)
    if candidate != expected:
        raise ValueError("candidate plan differs from independent manifest")
    groups = expected["shards"][shard_index]
    required = {g["sha256"]: g["size"] for g in groups}
    if not isinstance(payloads, dict) or set(payloads) != set(required):
        raise ValueError("missing or unexpected representative")
    for digest, size in required.items():
        raw = payloads[digest]
        if type(raw) is not bytes or len(raw) != size:
            raise ValueError("invalid representative size or type")
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError("representative digest mismatch")
    return {"verified_representatives": len(required),
            "verified_bytes": sum(required.values()),
            "production_authoritative": False}
