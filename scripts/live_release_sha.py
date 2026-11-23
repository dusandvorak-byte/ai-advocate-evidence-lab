"""Fail-closed live SHA check for the reviewed and hardened PDF release states.

Accept a live byte digest only if it is either the reviewed pre-release copy,
or the independently audited final hardened candidate. Arbitrary third states
must never be accepted, even when HTTP reports success.
"""

import re

_SHA256 = re.compile(r"[0-9a-f]{64}\Z")


def accepted_live_public_sha(live_sha, reviewed_sha, candidate_sha, candidate_verified):
    if not candidate_verified:
        return False
    if not all(isinstance(s, str) and _SHA256.fullmatch(s) for s in (live_sha, reviewed_sha, candidate_sha)):
        return False
    return live_sha == reviewed_sha or live_sha == candidate_sha
