"""Restore exact reviewed PDF bytes from verified textual transport chunks."""
from pathlib import Path
import base64, hashlib, io, json, lzma, tarfile

root = Path(__file__).resolve().parents[1]
for folder in ['project-memory/pdf-release-2026-09-29', 'project-memory/pdf-release-2026-09-29-kpr']:
    source = root / folder
    manifest = json.loads((source / 'manifest.json').read_text())
    chunks = []
    for item in manifest['chunks']:
        data = (source / item['name']).read_bytes()
        assert len(data) == item['size'] and hashlib.sha256(data).hexdigest() == item['sha256'], item['name']
        chunks.append(data)
    payload = base64.b64decode(b''.join(chunks), validate=True)
    assert hashlib.sha256(payload).hexdigest() == manifest['archive_sha256']
    expected = {item['path']: item for item in manifest['files']}
    with tarfile.open(fileobj=io.BytesIO(lzma.decompress(payload)), mode='r:') as archive:
        members = archive.getmembers()
        assert len(members) == len(expected) and {item.name for item in members} == set(expected)
        for member in members:
            assert member.isfile() and member.name.startswith('web/documents/') and '..' not in Path(member.name).parts
            data = archive.extractfile(member).read()
            item = expected[member.name]
            assert len(data) == item['size'] and hashlib.sha256(data).hexdigest() == item['sha256'], member.name
            assert data.startswith(b'%PDF-') and b'%%EOF' in data[-2048:], member.name
            target = root / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    print(f'PDF release 2026-09-29: {len(expected)} complete, hash-verified PDFs restored')
