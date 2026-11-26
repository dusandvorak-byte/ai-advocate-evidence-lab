import unittest
import hashlib
from copy import deepcopy
from transfer_plan import plan, compare_plan, verify_payload

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

    def test_verify_actual_bytes(self):
        raw = b"%PDF-1.4 synthetic bytes"
        digest = hashlib.sha256(raw).hexdigest()
        rows = [{"path":"a.pdf","sha256":digest,"size":len(raw)},
                {"path":"web/a.pdf","sha256":digest,"size":len(raw)}]
        p = plan(rows, 2)
        result = verify_payload(p, rows, 2, 0, {digest:raw})
        self.assertEqual(result["verified_representatives"],1)
        self.assertEqual(result["verified_bytes"],len(raw))
        self.assertFalse(result["production_authoritative"])
        self.assertEqual(verify_payload(p,rows,2,1,{})["verified_bytes"],0)

    def test_reject_changed_missing_or_extra_bytes(self):
        raw = b"fixture"
        digest = hashlib.sha256(raw).hexdigest()
        rows = [{"path":"a.pdf","sha256":digest,"size":len(raw)}]
        p = plan(rows,1)
        for payload in ({},{digest:b"changed"},{digest:b"x"},{digest:bytearray(raw)},
                        {digest:raw,"c"*64:b"extra"}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                verify_payload(p,rows,1,0,payload)
        p["shards"][0][0]["paths"] = []
        with self.assertRaises(ValueError):
            verify_payload(p,rows,1,0,{digest:raw})

    def test_invalid_shard_index(self):
        raw = b"fixture"
        digest = hashlib.sha256(raw).hexdigest()
        rows = [{"path":"a.pdf","sha256":digest,"size":len(raw)}]
        p = plan(rows,1)
        for index in (-1,1,True):
            with self.assertRaises(ValueError):
                verify_payload(p,rows,1,index,{digest:raw})

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
