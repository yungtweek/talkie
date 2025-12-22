import json
from dataclasses import dataclass
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


@dataclass(frozen=True)
class HeuristicCompressorConfig:
    max_context: int | None
    keyword_keep_limit: int = 3
    min_docs_after_filter: int = 2
    thresholds: tuple[float, float, float] = (0.20, 0.10, 0.0)
    fallback_keep: int = 8


class HeuristicCompressor:
    def __init__(
        self,
        *,
        embeddings: Embeddings,
        max_context: int | None = None,
        cfg: HeuristicCompressorConfig | None = None,
    ):
        self.embeddings = embeddings
        self.cfg = cfg or HeuristicCompressorConfig(max_context=max_context)

    def compress_docs(self, *, query: str, docs: Sequence[Document]) -> list[Document]:
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
        logger.debug("[RAG][compress] start in=%s has_rerank=%s", len(docs), has_rerank)

        DC, EF = DocumentCompressorPipeline, EmbeddingsFilter
        filtered = None
        used_thresh = None

        # --- build keyword guard from query tokens ---
        toks = kw_tokens(query)
        must_keep: list = []
        try:
            # keep at most 3 strong keyword hits from original order
            for d in docs:
                if len(must_keep) >= self.cfg.keyword_keep_limit:
                    break
                if kw_hit(toks, d):
                    must_keep.append(d)
        except Exception:
            must_keep = []

        # --- compressor with adaptive threshold ---
        if DC and EF:
            for th in self.cfg.thresholds:
                try:
                    compressor = DC(
                        transformers=cast(
                            "list[BaseDocumentTransformer | BaseDocumentCompressor]",
                            [
                                EF(
                                    embeddings=self.embeddings,
                                    similarity_threshold=th,
                                )
                            ],
                        )
                    )
                    out = compressor.compress_documents(cast("Sequence[Any]", docs), query)
                    # ensure at least some docs remain; if not, relax further
                    if out and len(out) >= self.cfg.min_docs_after_filter:
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

        # --- trim to context budget ---
        out, total = [], 0
        for d in kept:
            ln = len(d.page_content or "")
            if self.cfg.max_context is not None and total + ln > self.cfg.max_context:
                continue
            out.append(d)
            total += ln

        # Guarantee at least a small set
        if not out:
            out = kept[: min(len(kept), self.cfg.fallback_keep)]

        try:
            logger.debug(
                "[RAG][compress] done in=%s used_th=%s kw_keep=%s out=%s dens='full'",
                len(docs),
                used_thresh,
                len(must_keep),
                len(out),
            )
        except Exception:
            pass

        return out
