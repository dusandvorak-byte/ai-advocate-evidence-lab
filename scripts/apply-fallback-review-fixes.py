#!/usr/bin/env python3
from pathlib import Path

path = Path("scripts/harden-public-pdf-privacy.py")
text = path.read_text("utf-8")
start = text.index("def worker_candidate(rel: str, force_rewrite: bool, before_fast: dict) -> None:\n")
end = text.index("\n\ndef main() -> None:\n", start)
new_function = '''def worker_candidate(rel: str, force_rewrite: bool, before_fast: dict) -> None:
    path = WEB / rel
    original_bytes = path.read_bytes()
    before_sha = sha256_bytes(original_bytes)
    before_pages = before_fast.get("page_count")
    pdf_rules, _ = private_pdf_rules()
    matchers = prepared_private_byte_matchers()
    strategy = candidate_strategy(before_fast, force_rewrite)
    matches = []
    data = None
    text_fallback = None
    raw_fallback_hits = []

    try:
        if strategy == "qpdf_rewrite":
            data = canonicalize_pdf_qpdf(path)
        elif strategy == "verify_only":
            data = None
        else:
            rules_for_worker = pdf_rules
            if strategy == "redact":
                rules_for_worker = targeted_pdf_rules(
                    pdf_rules,
                    before_fast.get("text_redaction_rule_ids") or [],
                )
                if not rules_for_worker:
                    # Fail safe: never suppress a redaction just because the optimization
                    # could not map the fast-scan hit to an explicit authenticated rule.
                    rules_for_worker = pdf_rules
            data, matches = harden_pdf(
                path,
                rules_for_worker,
                force_rewrite=force_rewrite,
                search_private=(strategy == "redact"),
            )
        if data is not None:
            path.write_bytes(data)

        if strategy == "qpdf_rewrite":
            post = inspect_qpdf_rewrite_post(path, matchers)
        else:
            post = inspect_pdf_deep(path, matchers)

        if requires_text_fallback(post):
            text_fallback = dict(build_public_text_copy(
                path,
                path,
                redact_text=redact_public_text,
                forbidden_text=forbidden_public_identifiers,
            ))
            text_fallback["fallback_input_sha256"] = text_fallback.get("source_sha256")
            text_fallback["fallback_input_page_count"] = text_fallback.get("source_page_count")
            text_fallback["source_sha256"] = before_sha
            text_fallback["source_page_count"] = before_pages
            post = inspect_pdf_deep(path, matchers)
            raw_fallback_hits = sorted(set(
                forbidden_public_identifier_byte_hits(path.read_bytes(), matchers)
            ))
            strategy = strategy + "+text_fallback"

        after_sha = sha256_file(path)
        after_pages = post.get("page_count")
        if post.get("text_scan_ok"):
            visible_hits = post.get("visible_private_hits") or []
            visible_scan_ok = True
        else:
            visible_hits, visible_scan_ok = forbidden_hits_isolated(path)
        local_failures = []
        if before_pages != after_pages:
            local_failures.append(
                f"page-count changed during privacy hardening: {rel} {before_pages}->{after_pages}"
            )
        if not visible_scan_ok:
            local_failures.append(f"visible privacy scan failed after hardening: {rel}")
        elif visible_hits:
            local_failures.append(
                f"known private identifier remains after privacy hardening: {rel}: {visible_hits}"
            )
        if post.get("decoded_private_hits"):
            local_failures.append(
                f"decoded private identifier remains after privacy hardening: {rel}: {post['decoded_private_hits']}"
            )
        if not post.get("decoded_scan_ok"):
            local_failures.append(f"decoded privacy scan failed after hardening: {rel}")
        if not post.get("pdf_revision_markers_bound") or not post.get("pdf_single_revision_only"):
            local_failures.append(f"PDF revision envelope remains noncanonical after hardening: {rel}")
        if raw_fallback_hits:
            local_failures.append(
                f"raw private identifier remains after text fallback: {rel}: {raw_fallback_hits}"
            )

        changed = bool(data is not None or text_fallback is not None)
        if text_fallback is not None and local_failures:
            path.write_bytes(original_bytes)
            after_sha = before_sha
            after_pages = before_pages
            changed = False
    except Exception:
        path.write_bytes(original_bytes)
        raise

    candidate = {
        "rel": rel,
        "strategy": strategy,
        "before_sha": before_sha,
        "before_pages": before_pages,
        "after_sha": after_sha,
        "after_pages": after_pages,
        "changed": changed,
        "matches": matches,
        "text_fallback": text_fallback,
        "raw_fallback_hits": raw_fallback_hits,
        "visible_hits": visible_hits,
        "post": post,
        "failures": local_failures,
    }
    print(json.dumps({"candidate": candidate}, ensure_ascii=False))
'''
path.write_text(text[:start] + new_function + text[end:], "utf-8")
