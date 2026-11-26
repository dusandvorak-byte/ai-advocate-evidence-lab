"""Generate a candidate hash lock for exact observed versions, not approval."""
import email
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def lock(expected, directory):
    expected = {normalize(k): v for k,v in expected.items()}
    found = {}
    for wheel in sorted(Path(directory).glob("*.whl")):
        with zipfile.ZipFile(wheel) as archive:
            files = [n for n in archive.namelist() if n.endswith(".dist-info/METADATA")]
            if len(files) != 1:
                raise ValueError("ambiguous wheel metadata")
            meta = email.message_from_bytes(archive.read(files[0]))
        name, version = normalize(meta["Name"]), meta["Version"]
        if name in found or expected.get(name) != version:
            raise ValueError("unexpected wheel identity")
        with wheel.open("rb") as stream:
            sha = hashlib.file_digest(stream, "sha256").hexdigest()
        found[name] = f"{name}=={version} --hash=sha256:{sha}"
    if set(found) != set(expected):
        raise ValueError("incomplete wheel closure")
    return "\n".join(found[n] for n in sorted(found)) + "\n"


if __name__ == "__main__":
    observed = json.loads(Path(sys.argv[1]).read_text())
    sys.stdout.write(lock(observed["python_distributions"], sys.argv[2]))
