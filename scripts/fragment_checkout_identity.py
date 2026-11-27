"""Exact checkout identity for isolated fragments; host remains Git authoritative."""
import os
from pathlib import Path
import re
import subprocess
import sys
from registry_pdf_fact_reuse import require_trusted_registry_reuse


def exact_checkout_sha(root):
    root = Path(root)
    if os.environ.get("EVIDENCE_LAB_OFFLINE_FRAGMENT") != "1":
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    require_trusted_registry_reuse(os.environ)
    args = sys.argv[1:]
    if args != ["generated"] and not (len(args) == 3 and args[0] == "pdf-shard"
            and re.fullmatch(r"[0-9]|1[0-5]", args[1]) and args[2] == "16"):
        raise ValueError("offline checkout identity is restricted to fragment commands")
    sha = os.environ.get("GITHUB_SHA", "")
    gitdir = root / ".git"
    head = gitdir / "HEAD"
    if (not re.fullmatch(r"[0-9a-f]{40}", sha) or not gitdir.is_dir() or gitdir.is_symlink()
            or not head.is_file() or head.is_symlink()
            or head.read_bytes() != (sha + "\n").encode("ascii")):
        raise ValueError("offline fragment requires exact detached checkout HEAD")
    # The host wrapper independently verifies the actual commit object with Git.
    # This read is from the same read-only checkout mount, not an env-only claim.
    return sha
