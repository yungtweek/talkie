import json
from logging import getLogger
from typing import Any, Sequence, TYPE_CHECKING, cast

from langchain_core.embeddings import Embeddings

from chat_worker.application.rag.document import Document
from chat_worker.application.rag.helpers import kw_hit, kw_tokens

if TYPE_CHECKING:
    from langchain.retrievers.document_compressors import (
        BaseDocumentCompressor,
        BaseDocumentTransformer,
    )
else:  # pragma: no cover - only needed for static typing
    BaseDocumentTransformer = BaseDocumentCompressor = Any

try:
    from langchain.retrievers.document_compressors import (
        DocumentCompressorPipeline,
        EmbeddingsFilter,
    )
except Exception:
    DocumentCompressorPipeline = None  # type: ignore
    EmbeddingsFilter = None  # type: ignore

logger = getLogger("RagPipeline")


def _doc_id_for_log(d: Any) -> str:
    md = d.metadata if isinstance(getattr(d, "metadata", None), dict) else {}
    return str(md.get("chunk_id") or md.get("id") or getattr(d, "doc_id", None) or "<no-id>")


def _doc_file_for_log(d: Any) -> str:
    md = d.metadata if isinstance(getattr(d, "metadata", None), dict) else {}
    return str(md.get("filename") or md.get("source") or getattr(d, "title", None) or "<no-file>")


def _doc_summary_for_log(d: Any) -> str:
    md = d.metadata if isinstance(getattr(d, "metadata", None), dict) else {}
    rid = _doc_id_for_log(d)
    fn = _doc_file_for_log(d)
    rr = md.get("rerank_score")
    os = md.get("__orig_score") if md.get("__orig_score") is not None else md.get("score")
    orank = md.get("__orig_rank")
    ln = len(getattr(d, "page_content", "") or "")
    return f"id={rid} rr={rr} orig_score={os} orig_rank={orank} len={ln} file={fn}"


def _log_docs(prefix: str, docs: Sequence[Any], *, limit: int = 12) -> None:
    try:
        logger.debug("%s count=%s", prefix, len(docs))
        for i, d in enumerate(docs[:limit], start=1):
            logger.debug("%s[%02d] %s", prefix, i, _doc_summary_for_log(d))
        if len(docs) > limit:
            logger.debug("%s ... (%s more)", prefix, len(docs) - limit)
    except Exception:
        pass


def doc_stable_key(d: Any):
    """
    Return a stable, hashable key for a document or chunk.

    Preference order:
      1) Explicit IDs: doc_id, or (file_id, chunk_index)
      2) Metadata IDs: weaviate_id, id, uuid, chunk_id
      3) (title, chunk_index) as a soft key
      4) Fallback to object identity (id)
    Pure function; works with both custom and LangChain Documents.
    """
    # 1) Explicit IDs on our model
    if getattr(d, "doc_id", None):
        return d.doc_id
    if getattr(d, "file_id", None) and getattr(d, "chunk_index", None) is not None:
        return d.file_id, d.chunk_index

    # 2) Metadata-based IDs
    meta = d.metadata if isinstance(d.metadata, dict) else {}
    for k in ("weaviate_id", "id", "uuid", "chunk_id"):
        v = meta.get(k)
        if v:
            return v

    # 3) Soft key: title + chunk_index
    if getattr(d, "title", None) and getattr(d, "chunk_index", None) is not None:
        return d.title, d.chunk_index

    # 4) Absolute fallback
    return id(d)


def doc_score(d: Document) -> float:
    """
    Estimate a document's score for ranking.

    Priority:
      - Document.score (if present and numeric)
      - metadata["__orig_score"]
      - metadata["score"]
      - 1 - metadata["distance"] (distance to similarity)
      - -inf if unknown
    """
    # Prefer model-level score
    score = getattr(d, "score", None)
    if isinstance(score, (int, float, str)):
        try:
            return float(score)
        except Exception:
            pass

    meta = d.metadata if isinstance(d.metadata, dict) else {}
    if meta.get("__orig_score") is not None:
        try:
            return float(meta["__orig_score"])
        except Exception:
            return float("-inf")
    if meta.get("score") is not None:
        try:
            return float(meta["score"])
        except Exception:
            pass
    if meta.get("distance") is not None:
        try:
            return 1.0 - float(meta["distance"])
        except Exception:
            pass
    return float("-inf")


def doc_rerank_score(d: Document) -> float:
    """
    Return rerank score if present; otherwise -inf.
    """
    meta = d.metadata if isinstance(d.metadata, dict) else {}
    if meta.get("rerank_score") is not None:
        try:
            return float(meta["rerank_score"])
        except Exception:
            return float("-inf")
    return float("-inf")


def doc_rank(d: Document) -> int:
    """
    Return original retrieval rank if available; higher value means worse rank.

    Falls back to a large number if rank is unavailable to preserve
    ordering among items with known ranks.
    """
    meta = d.metadata if isinstance(d.metadata, dict) else {}
    raw_rank = meta.get("__orig_rank")
    try:
        if isinstance(raw_rank, (int, float, str)):
            return int(raw_rank)
        return 10**9
    except Exception:
        return 10**9


def compress_docs(
    docs: Sequence[Document],
    query: str,
    *,
    embeddings: Embeddings,
    max_context: int | None,
) -> list[Document]:
    """
    Compress retrieved documents while preserving original scores and ranks.
    Uses embedding filter (if available), keyword guard, and context budget.
    Returns an ordered subset for prompt context.
    """
    # Normalize all incoming docs to our Document model
    try:
        docs = [Document.from_any(d) for d in docs]
    except Exception:
        docs = [d if isinstance(d, Document) else Document.from_langchain(d) for d in docs]

    # --- annotate original docs (compatible with custom Document & LangChain Document) ---
    for d in docs:
        md = d.metadata
        if not isinstance(md, dict):
            if isinstance(md, str):
                try:
                    md = json.loads(md)
                except Exception:
                    md = {}
            else:
                md = {}
        d.metadata = md

    # --- detect rerank results and preserve rerank order for tie-breaking ---
    has_rerank = False
    rerank_pos: dict[Any, int] = {}
    for i, d in enumerate(docs):
        k = doc_stable_key(d)
        if k not in rerank_pos:
            rerank_pos[k] = i
        md = d.metadata if isinstance(d.metadata, dict) else {}
        if md.get("rerank_score") is not None:
            has_rerank = True

    _log_docs("[RAG][compress][input]", docs)
    logger.debug("[RAG][compress] has_rerank=%s", has_rerank)

    DC, EF = DocumentCompressorPipeline, EmbeddingsFilter
    filtered = None
    used_thresh = None

    # --- build keyword guard from query tokens ---
    toks = kw_tokens(query)
    must_keep: list = []
    try:
        # keep at most 3 strong keyword hits from original order
        for d in docs:
            if len(must_keep) >= 3:
                break
            if kw_hit(toks, d):
                must_keep.append(d)
    except Exception:
        must_keep = []

    # --- compressor with adaptive threshold ---
    if DC and EF:
        for th in (0.20, 0.10, 0.0):
            try:
                compressor = DC(
                    transformers=cast(
                        "list[BaseDocumentTransformer | BaseDocumentCompressor]",
                        [
                            EF(
                                embeddings=embeddings,
                                similarity_threshold=th,
                            )
                        ],
                    )
                )
                out = compressor.compress_documents(cast("Sequence[Any]", docs), query)
                # ensure at least some docs remain; if not, relax further
                if out and len(out) >= 2:
                    filtered = out
                    used_thresh = th
                    break
                # if nothing/too few, try lower threshold
            except Exception as e:
                logger.warning(f"[RAG] compressor failed (th={th}): {e}")
                filtered = None
                used_thresh = th
                break
    # Fallback when no compressor or it failed entirely
    if filtered is None:
        filtered = list(docs)
        used_thresh = -1

    # Always keep the first retrieved doc as an anchor.
    anchor = docs[0] if docs else None
    keep_set = set()
    kept: list = []

    # add anchor first
    if anchor:
        k = doc_stable_key(anchor)
        keep_set.add(k)
        kept.append(anchor)

    # add keyword-guard docs
    for d in must_keep:
        k = doc_stable_key(d)
        if k not in keep_set:
            keep_set.add(k)
            kept.append(d)

    # add filtered results in original order
    for d in filtered:
        k = doc_stable_key(d)
        if k not in keep_set:
            keep_set.add(k)
            kept.append(d)

    # Snippet extraction disabled: keep full chunk content for maximum recall.
    # Keep original `page_content` for all kept docs; no density filtering.
    # Maximizes recall at the cost of longer context.
    kept = list(kept)

    _log_docs("[RAG][compress][kept-pre-sort]", kept)

    # Restore stable order, preferring rerank scores when available.
    if has_rerank:
        kept = sorted(
            kept,
            key=lambda d: (
                -doc_rerank_score(d),
                rerank_pos.get(doc_stable_key(d), 10**9),
            ),
        )
    else:
        kept = sorted(kept, key=lambda d: (-doc_score(d), doc_rank(d)))

    if has_rerank:
        _log_docs("[RAG][compress][kept-post-sort][by-rerank]", kept)
    else:
        _log_docs("[RAG][compress][kept-post-sort][by-orig]", kept)

    # --- trim to context budget ---
    out, total = [], 0
    for d in kept:
        ln = len(d.page_content or "")
        if max_context is not None and total + ln > max_context:
            try:
                logger.debug(
                    "[RAG][compress][budget-skip] total=%s add=%s max=%s %s",
                    total,
                    ln,
                    max_context,
                    _doc_summary_for_log(d),
                )
            except Exception:
                pass
            continue
        out.append(d)
        total += ln
        try:
            logger.debug(
                "[RAG][compress][budget-keep] total=%s/%s %s",
                total,
                max_context,
                _doc_summary_for_log(d),
            )
        except Exception:
            pass

    _log_docs("[RAG][compress][out-after-budget]", out)

    # Guarantee at least a small set
    if not out:
        out = kept[: min(len(kept), 8)]  # 6 -> 8

    _log_docs("[RAG][compress][final-out]", out)

    try:
        logger.debug(
            f"[RAG][compress] in={len(docs)} used_th={used_thresh} kw_keep={len(must_keep)} out={len(out)} dens='full'")
    except Exception:
        pass

    return out
