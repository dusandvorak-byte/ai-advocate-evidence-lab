"""Fetch the independently pinned successful audit used for late PDF pins.
Only trusted main workflow; temporary files, no publication or authorization.
"""
import importlib.util
import os
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location("benchmark_fetch", Path(__file__).with_name("fetch-benchmark-release.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

if __name__ == "__main__":
    if len(sys.argv) != 2 or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_EVENT_NAME") != "push" or os.environ.get("GITHUB_REF") != "refs/heads/main" or os.environ.get("GITHUB_REPOSITORY") != helper.REPO:
        raise SystemExit("Pinned baseline download requires trusted main push")
    root = Path(sys.argv[1]).resolve()
    root.mkdir(mode=0o700)
    helper.fetch(root, "prior", 45396121256, "fee5324f6145f27d3c1ece9526cca5e42f2902f9", {
        "tree": (14921488296, "8ecac55a903c75b6e827bf68f4b6eb281966c2154ac18d7d3925ade6aa1fd09e"),
        "report": (14921139948, "db494863b05d78e0423460feb6ea021c53e0444ae3f41e1d43e8315743e65350"),
    })
