#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import runpy
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
HARDENER = ROOT / "scripts/harden-public-pdf-privacy.py"
OUT = ROOT / "review-artifacts/privacy-hardening-residual-diagnostic.json"

TARGETS = [
    "documents/justice-slalom/2026-07/44-podani-2026-07-02.pdf",
    "documents/justice-slalom/2026-08/066-podani-2026-08-12.pdf",
    "documents/justice-slalom/2026-09/083-podani-2026-09-27.pdf",
    "documents/justice-slalom/2026-10/101-podani-2026-10-10-ns-nsz-msp-mv-pp.pdf",
    "documents/justice-slalom/2026-10/106-podani-2026-10-15-ombudsman-202602199-redigovany-original.pdf",
    "documents/originaly-2026-11-03/2026-10-16-cnb-2026-167900-cnb-110-original.pdf",
    "documents/report-04082026-010/90-os-prostejov-15-nt-3104-2026-2026-09-14.pdf",
    "documents/report-25072026-007/07-vsz-msz-praha-doplneni-2026-07-02.pdf",
    "documents/report-25072026-007/12-msz-praha-zadost-spis-2026-07-13.pdf",
    "documents/report-25072026-007/18-vsz-praha-1-vzn-1678-2026-70-2026-07-23.pdf",
]


def ns() -> dict:
    return runpy.run_path(str(HARDENER), run_name="privacy_stage_diagnostic_import")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def last_json(stdout: str) -> dict:
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return {"status": "invalid_output", "tail": stdout[-1000:]}


def child_harden(path: Path, inspection_path: Path) -> int:
    mod = ns()
    inspection = json.loads(inspection_path.read_text("utf-8"))
    rules, _ = mod["private_pdf_rules"]()
    strategy = mod["candidate_strategy"](inspection, True)
    selected = rules
    if strategy == "redact":
        selected = mod["targeted_pdf_rules"](
            rules,
            inspection.get("text_redaction_rule_ids") or [],
        )
        if not selected:
            selected = rules

    start = time.monotonic()
    matches = []
    if strategy == "qpdf_rewrite":
        data = mod["canonicalize_pdf_qpdf"](path)
    elif strategy == "verify_only":
        data = None
    else:
        data, matches = mod["harden_pdf"](
            path,
            selected,
            force_rewrite=True,
            search_private=(strategy == "redact"),
        )
    if data is not None:
        path.write_bytes(data)
    emit({
        "status": "ok",
        "stage": "harden",
        "strategy": strategy,
        "seconds": round(time.monotonic() - start, 3),
        "total_rule_count": len(rules),
        "selected_rule_count": len(selected),
        "redaction_match_count": len(matches),
        "output_size": path.stat().st_size,
        "output_sha256": digest(path),
    })
    return 0


def child_post(path: Path, strategy: str) -> int:
    mod = ns()
    matchers = mod["prepared_private_byte_matchers"]()
    start = time.monotonic()
    if strategy == "qpdf_rewrite":
        result = mod["inspect_qpdf_rewrite_post"](path, matchers)
    else:
        result = mod["inspect_pdf_deep"](path, matchers)
    emit({
        "status": "ok",
        "stage": "post",
        "strategy": strategy,
        "seconds": round(time.monotonic() - start, 3),
        "page_count": result.get("page_count"),
        "reasons": result.get("reasons") or [],
        "visible_hit_count": len(result.get("visible_private_hits") or []),
        "decoded_hit_count": len(result.get("decoded_private_hits") or []),
        "text_scan_ok": bool(result.get("text_scan_ok")),
        "decoded_scan_ok": bool(result.get("decoded_scan_ok")),
        "pdf_revision_markers_bound": bool(result.get("pdf_revision_markers_bound")),
        "pdf_single_revision_only": bool(result.get("pdf_single_revision_only")),
    })
    return 0


def run_child(args: list[str], timeout: int) -> dict:
    started = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "status": "timeout",
            "seconds": round(time.monotonic() - started, 3),
            "timeout_seconds": timeout,
            "stdout_tail": (exc.stdout or "")[-1000:] if isinstance(exc.stdout, str) else "",
            "stderr_tail": (exc.stderr or "")[-1000:] if isinstance(exc.stderr, str) else "",
        }
    parsed = last_json(proc.stdout)
    parsed.update({
        "process_returncode": proc.returncode,
        "process_seconds": round(time.monotonic() - started, 3),
    })
    if proc.returncode != 0:
        parsed["status"] = "error"
        parsed["stderr_tail"] = proc.stderr[-2000:]
    return parsed


def diagnose(rel: str) -> dict:
    source = WEB / rel
    row = {
        "path": rel,
        "exists": source.is_file(),
    }
    if not source.is_file():
        row["status"] = "missing"
        return row

    mod = ns()
    matchers = mod["prepared_private_byte_matchers"]()
    started = time.monotonic()
    try:
        inspection = mod["inspect_pdf_fast"](source, matchers)
    except Exception as exc:
        row.update({
            "status": "inspection_error",
            "inspection_seconds": round(time.monotonic() - started, 3),
            "error_type": type(exc).__name__,
        })
        return row

    row.update({
        "status": "diagnosed",
        "input_size": source.stat().st_size,
        "input_sha256": digest(source),
        "page_count": inspection.get("page_count"),
        "inspection_seconds": round(time.monotonic() - started, 3),
        "reasons": inspection.get("reasons") or [],
        "visible_hit_count": len(inspection.get("visible_private_hits") or []),
        "text_private_hit_count": len(inspection.get("text_private_hits") or []),
        "metadata_private_hit_count": len(inspection.get("metadata_private_hits") or []),
        "text_redaction_rule_count": len(inspection.get("text_redaction_rule_ids") or []),
        "text_scan_ok": bool(inspection.get("text_scan_ok")),
    })

    with tempfile.TemporaryDirectory(prefix="evidence-privacy-stage-") as tmp:
        temp_pdf = Path(tmp) / source.name
        inspection_path = Path(tmp) / "inspection.json"
        shutil.copy2(source, temp_pdf)
        inspection_path.write_text(json.dumps(inspection, ensure_ascii=False), "utf-8")

        harden = run_child(["--child-harden", str(temp_pdf), str(inspection_path)], timeout=240)
        row["harden"] = harden
        if harden.get("status") != "ok":
            row["terminal_stage"] = "harden"
            return row

        strategy = str(harden.get("strategy") or "")
        post = run_child(["--child-post", str(temp_pdf), strategy], timeout=240)
        row["post"] = post
        row["terminal_stage"] = "complete" if post.get("status") == "ok" else "post"
        return row


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(diagnose, rel): rel for rel in TARGETS}
        for future in as_completed(futures):
            rel = futures[future]
            try:
                row = future.result()
            except Exception as exc:
                row = {
                    "path": rel,
                    "status": "diagnostic_error",
                    "error_type": type(exc).__name__,
                }
            rows.append(row)
            emit({
                "path": row.get("path"),
                "status": row.get("status"),
                "terminal_stage": row.get("terminal_stage"),
                "strategy": (row.get("harden") or {}).get("strategy"),
                "harden_status": (row.get("harden") or {}).get("status"),
                "post_status": (row.get("post") or {}).get("status"),
            })

    rows.sort(key=lambda item: item["path"])
    summary = {
        "target_count": len(TARGETS),
        "present_count": sum(1 for row in rows if row.get("exists")),
        "missing_count": sum(1 for row in rows if row.get("status") == "missing"),
        "harden_timeout_count": sum(1 for row in rows if (row.get("harden") or {}).get("status") == "timeout"),
        "post_timeout_count": sum(1 for row in rows if (row.get("post") or {}).get("status") == "timeout"),
        "complete_count": sum(1 for row in rows if row.get("terminal_stage") == "complete"),
        "post_private_match_count": sum(
            1 for row in rows if "private_match" in ((row.get("post") or {}).get("reasons") or [])
        ),
        "post_scan_failure_count": sum(
            1 for row in rows if not (row.get("post") or {}).get("decoded_scan_ok", False)
        ),
        "strategy_counts": {},
    }
    for row in rows:
        strategy = (row.get("harden") or {}).get("strategy")
        if strategy:
            summary["strategy_counts"][strategy] = summary["strategy_counts"].get(strategy, 0) + 1

    payload = {
        "schema_version": "1.0",
        "purpose": "sanitized residual privacy-failure isolation after timeout root-cause repair",
        "secret_values_logged": False,
        "summary": summary,
        "documents": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", "utf-8")
    emit({"summary": summary, "artifact": str(OUT.relative_to(ROOT))})
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--child-harden":
        raise SystemExit(child_harden(Path(sys.argv[2]), Path(sys.argv[3])))
    if len(sys.argv) >= 2 and sys.argv[1] == "--child-post":
        raise SystemExit(child_post(Path(sys.argv[2]), sys.argv[3]))
    raise SystemExit(main())
