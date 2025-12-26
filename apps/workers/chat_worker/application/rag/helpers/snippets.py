def extract_snippets(toks: list[str], text: str, *, max_len: int = 320, max_snippets: int = 4) -> list[str]:
    """
    Extract context snippets around token hits; fall back to the head of the text if no hits.

    Behavior:
      - Find token hit positions (case-insensitive).
      - Build windows around hits and merge overlaps.
      - Trim lightly to sentence boundaries when possible.
    """
    import re

    if not text:
        return []
    low = text.lower()
    # Find hit positions for any token
    hits = []
    for t in toks:
        if not t:
            continue
        for m in re.finditer(re.escape(t.lower()), low):
            hits.append(m.start())
    # If no explicit hits, return first chunkish snippet
    if not hits:
        head = text.strip().splitlines()
        if head:
            head_text = " ".join(head[:3])[:max_len]
            return [head_text]
        return [text[:max_len]]
    # Build windows around hits, merge overlapping regions
    hits = sorted(hits)
    windows = []
    half = max_len // 2
    for pos in hits:
        start = max(0, pos - half)
        end = min(len(text), pos + half)
        if windows and start <= windows[-1][1] + 10:
            # merge with previous
            windows[-1] = (windows[-1][0], max(windows[-1][1], end))
        else:
            windows.append((start, end))
    # Extract up to max_snippets windows, trimmed to sentence boundaries if possible
    out: list[str] = []
    for (s, e) in windows[:max_snippets]:
        chunk = text[s:e]
        # light sentence boundary trim
        left = max(chunk.find(". "), chunk.find("\n"))
        right = max(chunk.rfind(". "), chunk.rfind("\n"))
        if 0 < left < len(chunk) - 1:
            chunk = chunk[left + 1 :]
        if 0 < right < len(chunk) - 1:
            chunk = chunk[: right + 1]
        out.append(chunk.strip())
    return out
