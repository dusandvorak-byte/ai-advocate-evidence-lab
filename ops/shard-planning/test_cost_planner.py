import unittest
from cost_planner import schedule, evaluate, load_observations
from pathlib import Path
import json

def sha(i):
    return f"{i:064x}"

class PlannerTests(unittest.TestCase):
    def test_complete_and_deterministic(self):
        groups = [(sha(i), i*100) for i in range(1,21)]
        hints = {sha(1):9000,sha(2):2000}
        a,_ = schedule(groups, 4, hints)
        b,_ = schedule(reversed(groups),4,hints)
        self.assertEqual(a,b)
        self.assertEqual(sorted(d for part in a for d in part), sorted(d for d,_ in groups))

    def test_no_hints_uses_original_size_order(self):
        groups = [(sha(1),100),(sha(2),80),(sha(3),50),(sha(4),10)]
        self.assertEqual(schedule(groups,2)[0],[[sha(1),sha(4)],[sha(2),sha(3)]])

    def test_observed_cost_improves_synthetic_imbalance(self):
        groups = [(sha(1),100),(sha(2),90),(sha(3),80),(sha(4),70)]
        hints = {sha(1):1000,sha(2):10,sha(3):10,sha(4):1000}
        result = evaluate(groups,2,hints)
        self.assertLess(result["candidate_peak_estimated_ms"],result["baseline_peak_estimated_ms"])
        self.assertFalse(result["production_authoritative"])

    def test_missing_and_invalid_hints_fallback(self):
        groups = [(sha(1),100),(sha(2),200)]
        self.assertEqual(schedule(groups,2,{sha(1):-1,sha(2):True}),schedule(groups,2))
        self.assertEqual(schedule(groups,2,{sha(9):999}),schedule(groups,2))

    def test_reject_duplicate_invalid_inputs(self):
        for groups,count in [([(sha(1),1),(sha(1),2)],2),([("invalid",1)],2),
                             ([(sha(1),0)],2), ([(sha(1),True)],2), ([],0)]:
            with self.assertRaises(ValueError):
                schedule(groups,count)

    def test_more_shards_than_files(self):
        bins,_ = schedule([(sha(1),10)],16)
        self.assertEqual(len(bins),16)
        self.assertEqual(sum(map(len,bins)),1)

    def test_real_observation_coverage_and_peak(self):
        root = Path(__file__).parent
        records = []
        for suffix in ("0-7", "8-15"):
            records.extend(json.loads((root / f"observations-45860853403-{suffix}.json").read_text()))
        groups = [(g["sha256"], g["size_bytes"]) for row in records for g in row["groups"]]
        hints = load_observations(root, groups)
        self.assertEqual(len(hints), 399)
        self.assertEqual(len(set(d for d, _ in groups)), 399)
        result = evaluate(groups, 16, hints)
        self.assertEqual(result["baseline_peak_estimated_ms"], 376930)
        self.assertEqual(result["candidate_peak_estimated_ms"], 195864)
        self.assertEqual(sorted(d for part in result["candidate"] for d in part), sorted(hints))

    def test_unknown_or_changed_size_has_no_hint(self):
        root = Path(__file__).parent
        first = json.loads((root / "observations-45860853403-0-7.json").read_text())[0]["groups"][0]
        self.assertEqual(load_observations(root, [(first["sha256"], first["size_bytes"] + 1), ("0"*64, 10)]), {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
