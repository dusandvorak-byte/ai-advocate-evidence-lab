import unittest
from copy import deepcopy
from transfer_plan import plan, compare_plan

def fixtures():
    return [{"path":"a.pdf","sha256":"a"*64,"size":100},
            {"path":"web/a.pdf","sha256":"a"*64,"size":100},
            {"path":"b.pdf","sha256":"b"*64,"size":60}]

class Tests(unittest.TestCase):
    def test_exact_coverage_and_dedup(self):
        p = plan(fixtures(),16)
        self.assertEqual(p["pdf_path_count"],3)
        self.assertEqual(p["unique_pdf_count"],2)
        self.assertEqual(p["representative_payload_bytes"],160)
        self.assertEqual(p["full_pdf_bytes_per_download"],260)
        self.assertEqual(sum(p["shard_payload_bytes"]),160)
        self.assertFalse(p["production_authoritative"])

    def test_deterministic(self):
        self.assertEqual(plan(fixtures(),2), plan(reversed(fixtures()),2))

    def test_missing_path(self):
        p = plan(fixtures(),2)
        p["shards"][0][0]["paths"].pop()
        self.assertFalse(compare_plan(p,fixtures(),2))

    def test_wrong_digest(self):
        p = plan(fixtures(),2)
        p["shards"][0][0]["sha256"] = "c"*64
        self.assertFalse(compare_plan(p,fixtures(),2))

    def test_duplicate_and_conflicting_size(self):
        for row in [fixtures()[0], {"path":"c.pdf","sha256":"a"*64,"size":99}]:
            with self.assertRaises(ValueError):
                plan(fixtures()+[row],2)

    def test_invalid_paths(self):
        for path in ["../a.pdf","/a.pdf","a//b.pdf","a/./b.pdf",".git/a","a\\b.pdf","a\n.pdf"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                plan([fixtures()[0]|{"path":path}],2)

    def test_invalid_identity(self):
        for field,value in [("size",True),("size",0),("sha256","bad")]:
            with self.assertRaises(ValueError):
                plan([fixtures()[0]|{field:value}],2)
        for count in (0,True):
            with self.assertRaises(ValueError):
                plan(fixtures(),count)
        with self.assertRaises(ValueError):
            plan([],2)

if __name__ == "__main__":
    unittest.main(verbosity=2)
