def count_hits(toks: list[str], text: str) -> int:
    """
    Count total occurrences of tokens in the given text (case-insensitive).
    """
    if not toks or not text:
        return 0
    low = text.lower()
    return sum(low.count((t or "").lower()) for t in toks if t)


def kw_hit(toks: list[str], d) -> bool:
    """
    Return True if any token appears in document text/metadata/filename (substring match).
    """
    try:
        meta = getattr(d, "metadata", {}) or {}
        txt = (getattr(d, "page_content", "") or "")
        fname = meta.get("filename") or ""
        fname_kw = meta.get("filename_kw") or ""
        blob = f"{txt} {fname} {fname_kw}".lower()
        return any((t or "").lower() in blob for t in toks)
    except Exception:
        return False
