"""Verify pinned archive digests and extract only expected baseline members."""
import hashlib
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

TREE_SHA = "bdf149bd30a186739f4ba4de1c6b5032a401884475e11d4a901ff053a79bff46"
REPORT_SHA = "2729bc6898d20e0a14a7a1f79c248db0fc136a2dbedccbeed36ded3f1285fb65"


def extract(archive, target, sha, report=False):
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != sha:
            raise ValueError("pinned archive digest mismatch")
    with zipfile.ZipFile(archive) as z:
        seen = set()
        for member in z.infolist():
            p = PurePosixPath(member.filename)
            path = p.as_posix()
            if (not p.parts or p.is_absolute() or ".." in p.parts
                    or "\\" in member.filename or path in seen
                    or stat.S_ISLNK(member.external_attr >> 16)):
                raise ValueError("unsafe archive member")
            seen.add(path)
            if report:
                allowed = path == "release-evidence-audit.json" and not member.is_dir()
            else:
                allowed = (p.parts[0] in ("web", "release-site") or
                           path in ("project-memory", "project-memory/documents-2026.json",
                                    "project-memory/privacy-hardening-report.json"))
            if not allowed:
                raise ValueError("unexpected archive member")
            dest = target.joinpath(*p.parts)
            if not dest.resolve().is_relative_to(target.resolve()):
                raise ValueError("archive destination escapes root")
        if report and seen != {"release-evidence-audit.json"}:
            raise ValueError("incomplete audit report")
        z.extractall(target)


if __name__ == "__main__":
    tree, report, checkout, out = map(Path, sys.argv[1:])
    extract(tree, checkout, TREE_SHA)
    extract(report, out, REPORT_SHA, report=True)
