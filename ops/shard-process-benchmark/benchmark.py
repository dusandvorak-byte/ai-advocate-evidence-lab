"""Isolated PyMuPDF multiprocessing benchmark. Synthetic PDFs only.

Measures parser workload, not full production privacy audit. No secrets,
repository PDFs, release authority, or changes to the existing runner.
"""
import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import json
import multiprocessing
from pathlib import Path
import resource
import statistics
import tempfile
import time


def create_fixtures(root):
    import fitz
    paths = []
    for index in range(24):
        path = root / f"synthetic-{index}.pdf"
        with fitz.open() as doc:
            for page_no in range(2 + index % 12):
                page = doc.new_page()
                page.insert_text((50, 50), f"Synthetic fixture {index}, page {page_no}")
                for line in range(20):
                    page.insert_text((50, 75 + 15*line), "Sample text for parsing and rendering.")
            doc.save(path, garbage=4, deflate=True)
        paths.append(path)
    return paths


def scan(path):
    import fitz
    with fitz.open(path) as doc:
        pages = []
        for page in doc:
            text = page.get_text()
            pix = page.get_pixmap(matrix=fitz.Matrix(1,1))
            pages.append([hashlib.sha256(text.encode()).hexdigest(),
                          hashlib.sha256(pix.samples).hexdigest()])
        return [path.name, doc.page_count, pages]


def measure(paths, workers):
    started = time.monotonic()
    if workers == 1:
        rows = [scan(p) for p in paths]
    else:
        with ProcessPoolExecutor(max_workers=workers,
                                 mp_context=multiprocessing.get_context("spawn")) as pool:
            rows = list(pool.map(scan, paths))
    elapsed = time.monotonic() - started
    return rows, round(elapsed * 1000)


def benchmark(repeats):
    with tempfile.TemporaryDirectory() as temp:
        paths = create_fixtures(Path(temp))
        baseline, _ = measure(paths, 1)
        measurements = {n: [] for n in (1,2,4)}
        for repeat in range(repeats):
            # Rotate order to reduce systematic warm-up bias.
            order = (1,2,4)
            for n in order[repeat % 3:] + order[:repeat % 3]:
                rows, elapsed = measure(paths, n)
                if rows != baseline:
                    raise RuntimeError("nonidentical parser results")
                measurements[n].append(elapsed)
        return {"scope":"synthetic-parser-only", "pdf_count":len(paths),
                "page_count":sum(r[1] for r in baseline),
                "exact_results_match":True,
                "measurements_ms":measurements,
                "median_ms":{n:statistics.median(v) for n,v in measurements.items()},
                "parent_peak_rss_kib":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                "largest_child_peak_rss_kib":resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                "production_authorization":False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=3, choices=(1,3,6))
    print(json.dumps(benchmark(parser.parse_args().repeats), sort_keys=True))
