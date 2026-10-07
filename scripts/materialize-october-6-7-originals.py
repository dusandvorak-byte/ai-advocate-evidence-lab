from pathlib import Path
import base64, hashlib

ROOT=Path('.')
ITEMS={
 'nsz_vsz':('project-memory/binary-sources-2026-10-07/nsz_vsz.b64','web/documents/justice-slalom/2026-10/099-podani-2026-10-06-nsz-vsz-spolecne-dukazni-doplneni.pdf','c831604cc60860d0dee289ea4a39bb61aa5a006f720ad975bcf1ef590fb9c0a7'),
 'prutahy':('project-memory/binary-sources-2026-10-07/prutahy.b64','web/documents/justice-slalom/2026-10/100-podani-2026-10-06-os-pro-stiznost-prutahy-9to315-9to316.pdf','2d87c87da8372655bd3f56316c2c17ffefd5b536d7ad97f362590c6e93120118'),
 'ksz_brno':('project-memory/binary-sources-2026-10-07/ksz_brno.b64','web/documents/report-04082026-010/114-ksz-brno-1-kzn-1090-2026-20-2026-09-30.pdf','435a844d59f61d4136a4953eccc476c79ce295cc98bca40a1ed4ed97cb61aba6'),
 'ksz_ostrava':('project-memory/binary-sources-2026-10-07/ksz_ostrava.b64','web/documents/report-04082026-010/113-ksz-ostrava-4-kzn-3239-2026-12-2026-09-29.pdf','6233b9a3b1ab1a07e83cca854b6fedc9a9678144e6a67527328ad2d84e33dfe4'),
 'os3106_prelozeno':('project-memory/binary-sources-2026-10-07/os3106_prelozeno.b64','web/documents/report-04082026-010/117-os-pro-15-nt-3106-2026-prelozeni-2026-10-06.pdf','6bc54398c249cf84be51720e1a50f8534775cbc190d07009105548a27d75199c'),
 'os3106_predvolani':('project-memory/binary-sources-2026-10-07/os3106_predvolani.b64','web/documents/report-04082026-010/118-os-pro-15-nt-3106-2026-predvolani-2026-10-06.pdf','a8946058816cd8f86707736202db2a5076fe8f86377657c727a14c315f939399'),
 'os3104_predvolani':('project-memory/binary-sources-2026-10-07/os3104_predvolani.b64','web/documents/report-04082026-010/116-os-pro-15-nt-3104-2026-predvolani-2026-10-06.pdf','61f9c34be63965ad6bf04011bd90838d499bb3732b54f691f97993b8677a26b5'),
 'os3104_prelozeno':('project-memory/binary-sources-2026-10-07/os3104_prelozeno.b64','web/documents/report-04082026-010/115-os-pro-15-nt-3104-2026-prelozeni-2026-10-06.pdf','8501ea116c03527f0025c88846481889c3c558df57e74286d60a8c0064c119f5'),
 'ms_final':('project-memory/binary-sources-2026-10-07/ms_final.b64','web/documents/justice-slalom/2026-10/098-podani-2026-10-06-ms-praha-18a17-18a23.pdf','ed5097243c80805a0ce6eaaf833b2bfd859bc6579ad9b70bffcd59f95e9cef82'),
}
ks_parts=sorted((ROOT/'project-memory/binary-sources-2026-10-07/ks-brno-9to316').glob('part-*.b64'))
if len(ks_parts)!=10:
    raise SystemExit(f'expected 10 KS Brno chunks, got {len(ks_parts)}')
ks_b64=''.join(p.read_text().strip() for p in ks_parts)
ITEMS['ks316']=(None,'web/documents/report-04082026-010/119-ks-brno-9-to-316-2026-219-doruceno-2026-10-07.pdf','237040f1d04d717aec1d945442574f36c7c89dc545626335760f653d3bbbc99f')

for key,(src,dst,expected) in ITEMS.items():
    b64=ks_b64 if key=='ks316' else (ROOT/src).read_text().strip()
    data=base64.b64decode(b64,validate=True)
    actual=hashlib.sha256(data).hexdigest()
    if actual!=expected:
        raise SystemExit(f'{key}: SHA mismatch {actual} != {expected}')
    if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-2048:]:
        raise SystemExit(f'{key}: invalid PDF framing')
    out=ROOT/dst
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_bytes(data)
    print(f'{key}: {len(data)} bytes {actual} -> {dst}')
