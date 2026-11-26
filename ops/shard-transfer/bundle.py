"""Nonpublishing digest-keyed archive experiment, no audit facts are reused."""
import hashlib
from pathlib import Path
import stat
import zipfile
from transfer_plan import plan, verify_payload


def build_bundle(root, rows, shard_count, index, destination):
    root = Path(root).resolve(strict=True)
    candidate = plan(rows, shard_count)
    if type(index) is not int or not 0 <= index < shard_count:
        raise ValueError("invalid shard index")
    payloads = {}
    for group in candidate["shards"][index]:
        source = root / group["representative"]
        if not source.resolve(strict=True).is_relative_to(root) or not source.is_file():
            raise ValueError("invalid representative source")
        payloads[group["sha256"]] = source.read_bytes()
    verify_payload(candidate, rows, shard_count, index, payloads)
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for digest, raw in sorted(payloads.items()):
            info = zipfile.ZipInfo(digest + ".pdf")
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            archive.writestr(info, raw)
    return candidate


def read_bundle(archive_path, rows, shard_count, index):
    candidate = plan(rows, shard_count)
    if type(index) is not int or not 0 <= index < shard_count:
        raise ValueError("invalid shard index")
    required = {g["sha256"] + ".pdf": g["size"] for g in candidate["shards"][index]}
    payloads = {}
    with zipfile.ZipFile(archive_path) as archive:
        members = archive.infolist()
        names = [m.filename for m in members]
        if len(names) != len(set(names)) or set(names) != set(required):
            raise ValueError("unexpected, duplicate or missing archive members")
        for member in members:
            if (member.is_dir() or stat.S_ISLNK(member.external_attr >> 16)
                    or member.file_size != required[member.filename]):
                raise ValueError("invalid archive member type or size")
            with archive.open(member) as stream:
                raw = stream.read(required[member.filename] + 1)
            digest = member.filename[:-4]
            if len(raw) != required[member.filename] or hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError("archive member byte identity mismatch")
            payloads[digest] = raw
    result = verify_payload(candidate, rows, shard_count, index, payloads)
    return result
