from __future__ import annotations

import math
from dataclasses import dataclass
from logging import getLogger
from typing import Any, Callable, Dict, List, Optional, Sequence

logger = getLogger("MMR")


@dataclass(frozen=True)
class MMRConfig:
    """MMR (Maximal Marginal Relevance) configuration.

    lambda_mult:
      - 1.0 => pure relevance (no diversity)
      - 0.0 => pure diversity (avoid similarity with selected at all costs)

    k:
      Maximum number of documents to return.

    fetch_k:
      How many candidates to consider from the input list (typically Top-K retrieved).

    similarity_threshold:
      Optional early-stop / pruning: if a candidate is *too* similar to already-selected
      items, it can be skipped.
    """

    lambda_mult: float = 0.7
    k: int = 6
    fetch_k: int = 24
    similarity_threshold: Optional[float] = 0.85


def _ensure_metadata(doc: Any) -> Dict[str, Any]:
    md = getattr(doc, "metadata", None)
    if md is None:
        md = {}
        try:
            setattr(doc, "metadata", md)
        except Exception:
            pass
    if not isinstance(md, dict):
        md = dict(md)
        try:
            setattr(doc, "metadata", md)
        except Exception:
            pass
    return md


def _doc_id(doc: Any) -> str:
    md = getattr(doc, "metadata", None) if isinstance(getattr(doc, "metadata", None), dict) else {}
    return str(md.get("chunk_id") or md.get("id") or getattr(doc, "doc_id", None) or "<no-id>")


def _doc_score(doc: Any) -> Optional[float]:
    v = getattr(doc, "score", None)
    if v is not None:
        try:
            return float(v)
        except Exception:
            pass
    md = getattr(doc, "metadata", None) if isinstance(getattr(doc, "metadata", None), dict) else {}
    # Prefer original retrieval score if present
    v = md.get("__orig_score")
    if v is None:
        v = md.get("__score")
    if v is None:
        v = md.get("score")
    try:
        return float(v) if v is not None else None
    except Exception:
        return None


def _doc_distance(doc: Any) -> Optional[float]:
    v = getattr(doc, "distance", None)
    if v is not None:
        try:
            return float(v)
        except Exception:
            pass
    md = getattr(doc, "metadata", None) if isinstance(getattr(doc, "metadata", None), dict) else {}
    v = md.get("distance")
    try:
        return float(v) if v is not None else None
    except Exception:
        return None


def _safe_cosine(a: Sequence[float], b: Sequence[float]) -> float:
    # cosine similarity in [-1, 1]
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += float(x) * float(y)
        na += float(x) * float(x)
        nb += float(y) * float(y)
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _get_embedding(doc: Any) -> Optional[Sequence[float]]:
    """Try to find an embedding vector on the doc.

    Expected options:
      - doc.metadata["embedding"]
      - doc.metadata["vector"]
      - doc.embedding

    If none found, return None.
    """

    md = getattr(doc, "metadata", None) if isinstance(getattr(doc, "metadata", None), dict) else {}
    emb = md.get("embedding")
    if emb is None:
        emb = md.get("vector")
    if emb is None:
        emb = getattr(doc, "embedding", None)
    return emb


def _get_relevance_value(doc: Any) -> Optional[float]:
    md = getattr(doc, "metadata", None) if isinstance(getattr(doc, "metadata", None), dict) else {}
    rr = md.get("rerank_score")
    if rr is not None:
        try:
            frr = float(rr)
        except Exception:
            frr = None
        if frr is not None and not math.isfinite(frr):
            return None
        return frr
    return _doc_score(doc)


def _compute_default_rel_scores(candidates: Sequence[Any]) -> Dict[int, float]:
    rel_scores: Dict[int, float] = {}
    dist_scores: Dict[int, float] = {}
    for i, d in enumerate(candidates):
        rel = _get_relevance_value(d)
        if rel is not None:
            rel_scores[i] = float(rel)
            continue
        dist = _doc_distance(d)
        if dist is not None:
            dist_scores[i] = float(dist)

    if dist_scores:
        min_d = min(dist_scores.values())
        max_d = max(dist_scores.values())
        denom = max_d - min_d
        for i, dist in dist_scores.items():
            if denom <= 0.0:
                rel_scores[i] = 1.0
            else:
                rel_scores[i] = max(0.0, min(1.0, (max_d - dist) / denom))

    for i in range(len(candidates)):
        rel_scores.setdefault(i, 0.0)
    return rel_scores


def mmr_select(
    *,
    query: str,
    docs: Sequence[Any],
    cfg: MMRConfig,
    relevance_fn: Optional[Callable[[str, Any], float]] = None,
    similarity_fn: Optional[Callable[[Any, Any], float]] = None,
) -> List[Any]:
    """Select up to k documents using MMR.

    This is a pure postprocessor: it expects you already have Top-K retrieved docs.

    Similarity:
      - If `similarity_fn` is not provided, we attempt cosine similarity using embeddings
        found on each doc.
      - If embeddings are missing, MMR degenerates to pure relevance.

    Returns:
      A list of selected docs in selection order.
    """

    if not docs:
        return []

    k = max(0, int(cfg.k))
    if k == 0:
        return []

    fetch_k = max(k, int(cfg.fetch_k))
    candidates = list(docs[:fetch_k])

    # Precompute relevance scores
    if relevance_fn is None:
        rel_scores = _compute_default_rel_scores(candidates)
    else:
        rel_scores = {}
        for i, d in enumerate(candidates):
            try:
                rel_scores[i] = float(relevance_fn(query, d))
            except Exception:
                rel_scores[i] = 0.0

    # Similarity function
    if similarity_fn is None:
        # Build embedding cache (may be None)
        embeddings: Dict[int, Optional[Sequence[float]]] = {i: _get_embedding(d) for i, d in enumerate(candidates)}

        # Debug: check embedding availability
        try:
            total = len(embeddings)
            with_emb = sum(1 for v in embeddings.values() if v is not None)
            logger.debug(
                "[RAG][mmr] embeddings: %s/%s candidates have embeddings",
                with_emb,
                total,
            )
        except Exception:
            pass

        def _sim(di: int, dj: int) -> float:
            a = embeddings.get(di)
            b = embeddings.get(dj)
            if a is None or b is None:
                return 0.0
            return _safe_cosine(a, b)

    else:
        def _sim(di: int, dj: int) -> float:
            try:
                return float(similarity_fn(candidates[di], candidates[dj]))
            except Exception:
                return 0.0

    # Start with the most relevant item
    selected: List[int] = []
    remaining: set[int] = set(range(len(candidates)))

    first = max(remaining, key=lambda i: rel_scores.get(i, 0.0))
    selected.append(first)
    remaining.remove(first)

    # Iteratively select items balancing relevance and diversity
    while remaining and len(selected) < k:
        best_i = None
        best_score = float("-inf")

        for i in list(remaining):
            max_sim = 0.0
            for s in selected:
                max_sim = max(max_sim, _sim(i, s))
            logger.debug(
                "[RAG][mmr][sim] cand=%s max_sim=%.4f",
                i,
                max_sim,
            )

            if cfg.similarity_threshold is not None and max_sim >= float(cfg.similarity_threshold):
                continue

            score = float(cfg.lambda_mult) * rel_scores.get(i, 0.0) - (1.0 - float(cfg.lambda_mult)) * max_sim
            if score > best_score:
                best_score = score
                best_i = i

        if best_i is None:
            break

        selected.append(best_i)
        remaining.remove(best_i)

    out = [candidates[i] for i in selected]

    # Attach debug metadata (non-invasive)
    try:
        for rank, d in enumerate(out, start=1):
            md = _ensure_metadata(d)
            md["mmr_rank"] = rank
            md["mmr_lambda"] = float(cfg.lambda_mult)
    except Exception:
        pass

    logger.debug(
        "[RAG][mmr] in=%s fetch_k=%s out=%s lambda=%s",
        len(docs),
        fetch_k,
        len(out),
        cfg.lambda_mult,
    )
    for idx, sel_i in enumerate(selected[:10], start=1):
        d = candidates[sel_i]
        md = getattr(d, "metadata", {}) if isinstance(getattr(d, "metadata", None), dict) else {}
        logger.debug(
            "[RAG][mmr][%02d] id=%s rel=%s mmr_rank=%s file=%s",
            idx,
            _doc_id(d),
            rel_scores.get(sel_i, None),
            md.get("mmr_rank"),
            md.get("filename") or md.get("source") or "<no-file>",
        )

    return out


class MMRPostprocessor:
    """Thin wrapper to match the existing postprocessors style.

    Usage:
      pp = MMRPostprocessor(cfg)
      docs = pp.apply(query, docs)

    Keep this minimal for now; expand later if you need async embedding fetch or caching.
    """

    def __init__(self, cfg: Optional[MMRConfig] = None):
        self.cfg = cfg or MMRConfig()

    def apply(
        self,
        *,
        query: str,
        docs: Sequence[Any],
        relevance_fn: Optional[Callable[[str, Any], float]] = None,
        similarity_fn: Optional[Callable[[Any, Any], float]] = None,
    ) -> List[Any]:
        return mmr_select(
            query=query,
            docs=docs,
            cfg=self.cfg,
            relevance_fn=relevance_fn,
            similarity_fn=similarity_fn,
        )
