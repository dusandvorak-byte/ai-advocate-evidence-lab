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
