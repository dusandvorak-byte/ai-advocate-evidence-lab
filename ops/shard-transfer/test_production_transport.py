import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import production_transport as transport

SHA = "a"*40
RUN = "123"


def fixture_inventory(root):
    # Synthetic test only; production uses the original audit candidate detector.
    return sorted([{"path":p.relative_to(root).as_posix(),
                    "sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
                    "size":p.stat().st_size}
                   for p in root.rglob("*") if p.is_file()],key=lambda row:row["path"])


class TransportTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.stage = self.root/"stage"
        self.stage.mkdir()
        for name,raw in [("a.pdf",b"%PDF-1.4 fixture A"),
                         ("web/a.pdf",b"%PDF-1.4 fixture A"),
                         ("b.pdf",b"%PDF-1.4 fixture B"),
                         ("signature-only",b"%PDF-1.4 fixture C")]:
            p = self.stage/name
            p.parent.mkdir(parents=True,exist_ok=True)
            p.write_bytes(raw)
        self.web = self.root/"web.json"
        self.canonical = self.root/"canonical.json"
        self.web.write_text('{"documents":[]}')
        self.canonical.write_text('{"documents":[{"id":"fixture"}]}')
        self.bundles = self.root/"bundles"
        self.mock = patch.object(transport,"inventory",fixture_inventory)
        self.mock.start()
        self.addCleanup(self.mock.stop)
        self.manifest_sha = transport.write_bundles(self.stage,self.web,self.canonical,self.bundles,SHA,RUN)
        self.manifest = transport.make_manifest(self.stage,self.web,self.canonical,SHA,RUN)
        self.index = next(i for i,g in enumerate(self.manifest["shards"]) if g)

    def test_roundtrip_full_coverage_and_exact_assembly(self):
        all_rows=[]
        for i in range(16):
            dest=self.root/f"restored-{i}"
            transport.unpack_bundle(self.bundles/str(i),dest,self.manifest_sha,SHA,RUN,i)
            rows=[{"published_path":r["path"],"sha256":r["sha256"]} for r in fixture_inventory(dest)]
            transport.validate_fragment_assignment(self.manifest,i,rows)
            all_rows.extend(rows)
        expected=[{"published_path":r["path"],"sha256":r["sha256"]} for r in fixture_inventory(self.stage)]
        self.assertEqual(sorted(all_rows,key=lambda r:r["published_path"]),expected)
        self.assertEqual(transport.digest(transport.json_bytes(self.manifest)),self.manifest_sha)

    def test_stale_or_changed_manifest_rejected(self):
        bundle=self.bundles/str(self.index)
        for sha,run,expected in [("b"*40,RUN,self.manifest_sha),(SHA,"124",self.manifest_sha),(SHA,RUN,"0"*64)]:
            with self.assertRaises(ValueError):
                transport.unpack_bundle(bundle,self.root/"unused",expected,sha,run,self.index)
        data=json.loads((bundle/"manifest.json").read_text())
        data["rows"].pop()
        raw=transport.json_bytes(data)
        with self.assertRaises(ValueError):
            transport.validate_manifest(raw,transport.digest(raw),SHA,RUN)

    def test_changed_registry_rejected(self):
        bundle=self.bundles/str(self.index)
        (bundle/"web-registry.json").write_text("{}")
        with self.assertRaises(ValueError):
            transport.unpack_bundle(bundle,self.root/"unused",self.manifest_sha,SHA,RUN,self.index)

    def test_missing_and_modified_payload_rejected(self):
        bundle=self.bundles/str(self.index)
        original=(bundle/"payload.zip").read_bytes()
        with zipfile.ZipFile(bundle/"payload.zip","w"):
            pass
        with self.assertRaises(ValueError):
            transport.unpack_bundle(bundle,self.root/"missing",self.manifest_sha,SHA,RUN,self.index)
        (bundle/"payload.zip").write_bytes(original)
        group=self.manifest["shards"][self.index][0]
        with zipfile.ZipFile(bundle/"payload.zip","w") as z:
            z.writestr(group["sha256"]+".pdf",b"x"*group["size"])
        with self.assertRaises(ValueError):
            transport.unpack_bundle(bundle,self.root/"changed",self.manifest_sha,SHA,RUN,self.index)

    def test_full_tree_change_cannot_match_manifest(self):
        (self.stage/"web/a.pdf").write_bytes(b"changed mirror")
        actual=transport.make_manifest(self.stage,self.web,self.canonical,SHA,RUN)
        self.assertNotEqual(transport.digest(transport.json_bytes(actual)),self.manifest_sha)

    def test_fragment_wrong_path_digest_duplicate_or_shard(self):
        group=self.manifest["shards"][self.index][0]
        rows=[{"published_path":p,"sha256":g["sha256"]} for g in self.manifest["shards"][self.index] for p in g["paths"]]
        for bad in (rows[:-1],rows+[rows[0]], [{"published_path":rows[0]["published_path"],"sha256":"0"*64}]+rows[1:]):
            with self.assertRaises(ValueError):
                transport.validate_fragment_assignment(self.manifest,self.index,bad)
        empty=next(i for i,g in enumerate(self.manifest["shards"]) if not g)
        with self.assertRaises(ValueError):
            transport.validate_fragment_assignment(self.manifest,empty,rows)


if __name__=="__main__":
    unittest.main(verbosity=2)
