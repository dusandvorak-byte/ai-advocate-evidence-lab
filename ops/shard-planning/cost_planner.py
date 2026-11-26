"""Deterministic, measurement-only shard scheduling experiment.

Timing hints affect ordering only; never omit, authorize or reuse PDF facts.
A missing/invalid hint uses a byte-size estimate. No production integration.
"""
import re
from fractions import Fraction

SHA = re.compile(r"[a-f0-9]{64}")


def schedule(groups, count, timings=None):
    if type(count) is not int or count < 1:
        raise ValueError("invalid shard count")
    items = list(groups)
    seen = set()
    for digest, size in items:
        if not isinstance(digest, str) or not SHA.fullmatch(digest) or digest in seen:
            raise ValueError("invalid or duplicate digest")
        if type(size) is not int or size < 1:
            raise ValueError("invalid PDF size")
        seen.add(digest)
    if timings is not None and not isinstance(timings, dict):
        raise ValueError("invalid timing map")
    hints = timings or {}
    # Use integer millisecond observations; ignore unknown and invalid hints.
    valid = {d: hints[d] for d, _ in items if type(hints.get(d)) is int
             and 0 < hints[d] <= 3600000}
    ratios = sorted(Fraction(valid[d], size) for d, size in items if d in valid)
    rate = ratios[len(ratios)//2] if ratios else Fraction(1)
    costs = {d: Fraction(valid[d]) if d in valid else max(Fraction(1), size * rate)
             for d, size in items}
    bins = [[] for _ in range(count)]
    loads = [Fraction(0) for _ in bins]
    for digest, size in sorted(items, key=lambda x: (-costs[x[0]], x[0])):
        target = min(range(count), key=lambda i: (loads[i], i))
        bins[target].append(digest)
        loads[target] += costs[digest]
    assert sorted(d for part in bins for d in part) == sorted(seen)
    return bins, costs


def evaluate(groups, count, timings):
    """Compare predicted cost under the same observations; not wall time."""
    groups = list(groups)
    baseline, _ = schedule(groups, count)
    candidate, costs = schedule(groups, count, timings)
    def peak(plan):
        return max(sum((costs[d] for d in part), Fraction(0)) for part in plan)
    return {"baseline": baseline, "candidate": candidate,
            "baseline_peak_estimated_ms": float(peak(baseline)),
            "candidate_peak_estimated_ms": float(peak(candidate)),
            "complete_coverage": True, "production_authoritative": False}


def load_observations(directory, current_groups):
    """Fixed historical measurements are scheduling hints, never audit facts."""
    import json
    from pathlib import Path
    root = Path(directory)
    source = "e1e1a5e517228d227a5b23635c2de3e865126c66"
    run = "45860853403"
    rows = []
    for suffix in ("0-7", "8-15"):
        rows.extend(json.loads((root / f"observations-{run}-{suffix}.json").read_text()))
    if sorted(row["shard"] for row in rows) != list(range(16)):
        raise ValueError("incomplete historical measurement coverage")
    observed = {}
    for row in rows:
        if (row["checkout_commit"] != source or row["workflow_run_id"] != run
                or row["shard_count"] != 16 or row["workers"] != 2
                or row["production_schedule_changed"] is not False):
            raise ValueError("incorrect historical measurement identity")
        for group in row["groups"]:
            digest, size, ms = group["sha256"], group["size_bytes"], group["elapsed_ms"]
            if (not SHA.fullmatch(digest) or digest in observed or type(size) is not int
                    or size < 1 or type(ms) is not int or not 0 < ms <= 3600000):
                raise ValueError("invalid or duplicate historical timing")
            observed[digest] = (size, ms)
    if len(observed) != 399:
        raise ValueError("incomplete historical digest coverage")
    return {digest: observed[digest][1] for digest, size in current_groups
            if digest in observed and observed[digest][0] == size}
