#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"unexpected {label} count: {count}")
    return text.replace(old, new)


def add_tests() -> None:
    path = Path("test/hardener_text_fallback.test.py")
    text = path.read_text("utf-8")
    text = replace_once(
        text,
        "import runpy\nimport shutil\nimport subprocess\n",
        "import runpy\nimport shutil\nimport stat\nimport subprocess\n",
        "stat import",
    )
    marker = "\n\nif __name__ == \"__main__\":\n    unittest.main()\n"
    tests = r'''
    def test_post_fallback_poppler_scan_failure_is_rejected(self):
        calls = self.install_successful_fallback()
        post_failed = clean_post()
        post_failed["text_scan_ok"] = False
        post_failed["reasons"] = ["text_scan_failed"]
        posts = iter([unsafe_post(), post_failed])
        self.globals["inspect_pdf_deep"] = lambda path, matchers: next(posts)
        self.globals["forbidden_public_identifier_byte_hits"] = lambda raw, matchers: []
        self.globals["forbidden_hits_isolated"] = lambda path: ([], True)

        candidate, _ = self.run_worker()

        self.assertEqual(len(calls), 1)
        self.assertFalse(candidate["post"]["text_scan_ok"])
        self.assertTrue(any(
            "visible privacy scan failed after hardening" in failure
            for failure in candidate["failures"]
        ))
        self.assertEqual(self.pdf.read_bytes(), self.original_bytes)

    def test_durable_commit_failure_restores_original_target(self):
        target = self.web / "durable.pdf"
        target.write_bytes(self.original_bytes)
        stage = self.web / ".durable.pdf.unit.candidate.pdf"
        candidate_bytes = b"verified-candidate-pdf"
        stage.write_bytes(candidate_bytes)
        real_fsync = self.globals["os"].fsync

        def fail_directory_fsync(fd):
            if stat.S_ISDIR(self.globals["os"].fstat(fd).st_mode):
                raise OSError("synthetic directory fsync failure")
            return real_fsync(fd)

        with mock.patch.object(
            self.globals["os"],
            "fsync",
            side_effect=fail_directory_fsync,
        ):
            with self.assertRaisesRegex(OSError, "synthetic directory fsync failure"):
                self.ns["commit_candidate_stage"](stage, target)

        self.assertEqual(target.read_bytes(), self.original_bytes)
        self.assertFalse(stage.exists())
        self.assertEqual(list(self.web.glob(".durable.pdf.*.candidate.pdf")), [])
'''
    text = replace_once(text, marker, tests + marker, "test insertion marker")
    path.write_text(text, "utf-8")


def implement() -> None:
    path = Path("scripts/harden-public-pdf-privacy.py")
    text = path.read_text("utf-8")
    old_commit = '''def commit_candidate_stage(stage: Path, target: Path) -> None:
    stage = Path(stage)
    target = Path(target)
    validate_candidate_stage(stage, target)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    stage_fd = os.open(stage, flags)
    try:
        if not stat.S_ISREG(os.fstat(stage_fd).st_mode):
            raise RuntimeError("candidate stage changed type before commit")
        os.fsync(stage_fd)
    finally:
        os.close(stage_fd)
    os.replace(stage, target)
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    directory_fd = os.open(target.parent, directory_flags)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
'''
    new_commit = '''def fsync_directory(directory: Path) -> None:
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    directory_fd = os.open(directory, directory_flags)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def commit_candidate_stage(stage: Path, target: Path) -> None:
    stage = Path(stage)
    target = Path(target)
    validate_candidate_stage(stage, target)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    stage_fd = os.open(stage, flags)
    try:
        if not stat.S_ISREG(os.fstat(stage_fd).st_mode):
            raise RuntimeError("candidate stage changed type before commit")
        os.fsync(stage_fd)
    finally:
        os.close(stage_fd)

    rollback = create_candidate_stage(target)
    replaced = False
    try:
        os.replace(stage, target)
        replaced = True
        fsync_directory(target.parent)
    except Exception:
        if replaced:
            try:
                os.replace(rollback, target)
                rollback = None
                try:
                    fsync_directory(target.parent)
                except OSError:
                    # The original bytes are already restored. Preserve the first
                    # durability error as the authoritative failure.
                    pass
            except Exception as rollback_error:
                raise RuntimeError(
                    "candidate commit failed and rollback could not restore the target"
                ) from rollback_error
        raise
    finally:
        cleanup_candidate_stage(rollback)
'''
    text = replace_once(text, old_commit, new_commit, "durable commit implementation")

    old_visible = '''    if post.get("text_scan_ok"):
        visible_hits = post.get("visible_private_hits") or []
        visible_scan_ok = True
    else:
        visible_hits, visible_scan_ok = forbidden_hits_isolated(path)
'''
    new_visible = '''    if post.get("text_scan_ok"):
        visible_hits = post.get("visible_private_hits") or []
        visible_scan_ok = True
    elif text_fallback is not None:
        # A fallback copy is publishable only when the required Poppler scan
        # succeeds. MuPDF-only extraction is not an equivalent privacy gate.
        visible_hits = []
        visible_scan_ok = False
    else:
        visible_hits, visible_scan_ok = forbidden_hits_isolated(path)
'''
    text = replace_once(text, old_visible, new_visible, "post-fallback visible scan gate")
    path.write_text(text, "utf-8")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "implementation"}:
        raise SystemExit("usage: repair-final-p2-20261121.py tests|implementation")
    if sys.argv[1] == "tests":
        add_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
