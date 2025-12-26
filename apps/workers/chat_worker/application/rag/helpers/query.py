from chat_worker import settings


def normalize_query(q: str, *, mode: str = "full") -> str:
    """
    Normalize a natural-language query.

    Modes:
      - full: NFC normalize, apply Korean tech aliases, lowercase,
              add boundaries between Hangul and ASCII/digits,
              strip punctuation, collapse whitespace.
      - light: NFC normalize, aliases, lowercase, keep dashes, light cleanup.
    """
    import re
    import unicodedata

    if q is None:
        return ""
    q = unicodedata.normalize("NFC", str(q))
    q = ko_tech_aliases(q)
    if mode == "full":
        q = q.lower()
        q = re.sub(r"([가-힣])([a-z0-9])", r"\1 \2", q)
        q = re.sub(r"([a-z0-9])([가-힣])", r"\1 \2", q)
        q = q.replace("-", " ")
        q = re.sub(r"[^\w\s]", " ", q)
        q = re.sub(r"\s+", " ", q).strip()
        return q
    if mode == "light":
        q = q.lower()
        q = re.sub(r"[^\w\s-]", " ", q)
        q = re.sub(r"\s+", " ", q).strip()
        return q
    return q


def ko_tech_aliases(q: str) -> str:
    """
    Normalize common Korean technical terms to English acronyms
    (e.g., '챗지피티' -> 'chatgpt', '엘엘엠' -> 'llm').
    """
    import re

    s = q
    rep = [
        (r"(챗|쳇)\s*지\s*피\s*티", "chatgpt"),
        (r"(지|쥐)\s*피\s*티", "gpt"),
        (r"엘엘엠|엘\s*엘\s*엠", "llm"),
        (r"에이\s*아이", "ai"),
        (r"에이\s*피\s*아이", "api"),
        (r"유\s*아이", "ui"),
        (r"디\s*비", "db"),
        (r"에스\s*큐\s*엘", "sql"),
        (r"제이\s*에스\s*온|제이슨", "json"),
        (r"피\s*디\s*에프", "pdf"),
        (r"시\s*에스\s*브이", "csv"),
        (r"유\s*알\s*엘", "url"),
        (r"에이\s*더블유\s*에스|아마존\s*웹\s*서비스", "aws"),
    ]
    for pat, to in rep:
        s = re.sub(pat, to, s, flags=re.IGNORECASE)
    return s


def kw_tokens(q: str) -> list[str]:
    """
    Extract ASCII/Korean tokens for lightweight keyword checks.

    Returns lowercase tokens with stopwords removed.
    """
    import re

    nq = normalize_query(q)
    ascii_words = re.findall(r"[a-z0-9]{2,}", nq)
    korean_words = re.findall(r"[가-힣]{2,}", nq)
    toks = ascii_words + korean_words
    try:
        stops = getattr(settings, "ko_stop_tokens", None) or []
    except Exception:
        stops = []
    stopset = {str(s).strip().lower() for s in stops if s}
    toks = [t for t in toks if t.lower() not in stopset]
    return toks


def kw_tokens_split(q: str) -> tuple[list[str], list[str]]:
    """
    Extract tokens and a rarer subset after stopword filtering.

    Returns:
        (all_tokens, rare_tokens)
        Rare = ASCII len >= 4 or Korean len >= 3
    """
    import re

    nq = normalize_query(q)
    ascii_words = re.findall(r"[a-z0-9]{3,}", nq)
    korean_words = re.findall(r"[가-힣]{2,}", nq)
    try:
        stops = getattr(settings, "ko_stop_tokens", None) or []
    except Exception:
        stops = []
    stopset = {str(s).strip().lower() for s in stops if s}
    ascii_words = [w for w in ascii_words if w.lower() not in stopset]
    korean_words = [h for h in korean_words if h.lower() not in stopset]
    toks = [*ascii_words, *korean_words]
    rare_ascii = [w for w in ascii_words if len(w) >= 4]
    rare_korean = [h for h in korean_words if len(h) >= 3]
    rare = rare_ascii + rare_korean
    return toks, rare
