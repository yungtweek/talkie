from logging import getLogger
from typing import Mapping, Any

import weaviate.classes as wvc

from chat_worker.application.rag.document import items_to_docs
from chat_worker.application.rag.helpers import log_items, resolve_context
from chat_worker.application.rag.helpers.chain import expand_queries, merge_docs
from chat_worker.application.rag.retrievers.base import RagContext, RetrieveResult, BaseRetriever

logger = getLogger("WeaviateNearTextRetriever")

class WeaviateNearTextRetriever(BaseRetriever):
    """Retriever using Weaviate near_text with server-side vectorization."""
    name = "weaviate_near_text"

    def __init__(self, ctx: RagContext):
        super().__init__(ctx)
        self._ctx = ctx

    def invoke(
            self,
            query: str,
            *,
            top_k: int | None = None,
            mmq: int | None = None,
            filters: Mapping[str, Any] | None = None,
            **kwargs: Any,
    ) -> RetrieveResult:
        ctx = getattr(self, "_ctx", None)
        if ctx is None:
            raise ValueError("RagContext is not set. Initialize WeaviateNearTextRetriever with ctx=RagContext.")

        mmq_eff = mmq if mmq is not None else getattr(ctx, "mmq", None)
        try:
            mmq_eff = int(mmq_eff) if mmq_eff is not None else None
        except Exception:
            mmq_eff = None

        if mmq_eff is not None and mmq_eff > 1:
            queries = expand_queries(query, mmq_eff)
            logger.info("[RAG][near_text] mmq enabled: mmq=%s queries=%s", mmq_eff, len(queries))
            logger.debug("[RAG][near_text] mmq variants=%s", queries)
            docs_by_query = []
            for q in queries:
                res = self._invoke_single(q, top_k=top_k, filters=filters)
                docs_by_query.append(list(res.get("docs") or []))
            k = int(top_k or getattr(ctx, "default_top_k", 6) or 6)
            max_hits = k * len(queries)
            docs = merge_docs(docs_by_query, limit=max_hits)
            return RetrieveResult(docs=docs, query=query, top_k=max_hits, filters=dict(filters) if filters else None)

        return self._invoke_single(query, top_k=top_k, filters=filters)

    def _invoke_single(
            self,
            query: str,
            *,
            top_k: int | None = None,
            filters: Mapping[str, Any] | None = None,
    ) -> RetrieveResult:
        logger.debug(f"[invoke] query={query} top_k={top_k} filters={filters}")
        ctx = getattr(self, "_ctx", None)
        if ctx is None:
            raise ValueError("RagContext is not set. Initialize WeaviateNearTextRetriever with ctx=RagContext.")

        # Dependencies from context
        client, collection_name, text_key, k, _mmq, nf = resolve_context(ctx, top_k, filters)

        if client is None or not hasattr(client, "collections"):
            raise ValueError("Weaviate >=1.0 Collections API required for near_text")

        coll = client.collections.use(collection_name)

        try:
            res = coll.query.near_text(
                query=query,
                distance=0.7,
                include_vector=True,
                limit=k,
                filters=nf,
                return_metadata=wvc.query.MetadataQuery(score=True, distance=True),
                return_properties=[text_key, "filename", "page", "chunk_index", "file_id", "chunk_id"],
            )
        except Exception as e:
            logger.error(f"query error: {e}")
            return RetrieveResult(docs=[], query=query, top_k=k, filters=dict(filters) if filters else None)

        items = list(getattr(res, "objects", None) or [])
        logger.debug(f"[items] {items}")

        docs = items_to_docs(items, text_key)
        if docs:
            with_vec = sum(1 for d in docs if isinstance(getattr(d, "metadata", None), dict) and d.metadata.get("vector") is not None)
            logger.debug(f"[RAG][near_text] vectors={with_vec}/{len(docs)}")
        return RetrieveResult(docs=docs, query=query, top_k=k, filters=dict(filters) if filters else None)
