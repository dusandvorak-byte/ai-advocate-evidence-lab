"""Conservative fingerprint of the PDF audit/hardening implementation and tools.

Unknown dependencies disable reuse. Changing the runner image, installed package
set, script bytes, executable bytes, or policy contract invalidates entries.
"""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def sha_file(path):
    with Path(path).open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def command(args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, timeout=30).decode("utf-8", errors="strict").strip()


def engine_fingerprint(root=ROOT):
    root = Path(root)
    # Deliberately conservative: all repository Python scripts, rather than
    # assuming a manually listed import closure is complete.
    scripts = {p.relative_to(root).as_posix(): sha_file(p) for p in sorted((root / "scripts").rglob("*.py"))}
    if not scripts or not (root / "project-memory/private-redaction-policy-contract.json").is_file():
        raise ValueError("missing dependency closure")
    tools = {}
    for name, args in (("qpdf", ["--version"]), ("pdftotext", ["-v"]), ("mutool", ["-v"])):
        executable = shutil.which(name)
        if not executable:
            raise ValueError("missing required executable: " + name)
        tools[name] = {"sha256": sha_file(executable), "version": command([executable, *args])}
    # Pin OS packages and Python distributions in addition to binary versions.
    distro = command(["dpkg-query", "-W", "-f=${Package}\t${Version}\n"])
    distributions = []
    for dist in importlib.metadata.distributions():
        record = dist.read_text("RECORD")
        if record is None:
            raise ValueError("Python distribution without RECORD")
        distributions.append([dist.metadata["Name"], dist.version, hashlib.sha256(record.encode()).hexdigest()])
    if not distributions:
        raise ValueError("missing Python distribution fingerprint")
    font_paths = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/dejavu/DejaVuSans.ttf")]
    fonts = {str(p): sha_file(p) for p in font_paths if p.is_file()}
    if not fonts:
        raise ValueError("missing PDF fallback font")
    image = os.environ.get("ImageVersion")
    if not image or not os.environ.get("ImageOS"):
        raise ValueError("unknown runner image")
    payload = {
        "schema": 1, "python": sys.version, "python_binary": sha_file(sys.executable),
        "platform": platform.platform(), "libc": platform.libc_ver(),
        "image": [os.environ["ImageOS"], image],
        "os_packages_sha256": hashlib.sha256(distro.encode()).hexdigest(),
        "python_distributions": sorted(distributions),
        "scripts": scripts, "tools": tools, "fonts": fonts,
        "policy_contract_sha256": sha_file(root / "project-memory/private-redaction-policy-contract.json"),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


if __name__ == "__main__":
    print(engine_fingerprint())
