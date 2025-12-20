from logging import getLogger

import weaviate
from typing import Dict, Any, List, Optional, Sequence, cast
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseLanguageModel

from chat_worker.application.rag.document import Document
from chat_worker.application.rag.helpers import normalize_search_type
from chat_worker.application.rag.postprocessors.compress_docs import (
    compress_docs as compress_docs_postprocessor,
)
from chat_worker.application.rag.retrievers.base import RagContext, RetrieveResult
from chat_worker.application.rag.retrievers.weaviate_near_text import WeaviateNearTextRetriever
from chat_worker.settings import Settings, RagConfig, WeaviateSearchType
from chat_worker.application.rag.retrievers.weaviate_hybrid import WeaviateHybridRetriever


logger = getLogger("RagPipeline")


class RagPipeline:
    """
    RAG pipeline that builds a prompt with retrieved context.

    Uses LangChain core primitives (Runnable, ChatPromptTemplate) together with
    Weaviate-based retrievers (hybrid and near_text) and optional document
    compression. This pipeline prepares the final prompt variables but does not
    call an LLM directly; the caller is responsible for invoking the model.

    Notes:
      - Hybrid search uses dynamic alpha and keyword guards to avoid filename-only bias.
      - Query normalization handles Korean–ASCII boundaries and tech term aliases.
      - Context packing enforces a strict budget while preserving ranking signals.
    """
    try:
        from langchain.retrievers.multi_query import MultiQueryRetriever  # type: ignore
    except Exception:
        MultiQueryRetriever = None  # type: ignore
    WeaviateHybridSearchRetriever = None  # deprecated / unsupported on Weaviate >=1.0

    @staticmethod
    def _extract_docs(result: RetrieveResult | Sequence[Document] | None) -> Sequence[Document]:
        """Normalize retriever outputs into a document sequence."""
        if isinstance(result, dict):
            docs = cast(Sequence[Document], result.get("docs") or [])
        else:
            docs = cast(Sequence[Document], result or [])
        return docs

    def __init__(
            self,
            *,
            settings: RagConfig | None = None,
            collection: str | None = None,
            text_key: str | None = None,
            client: Optional[weaviate.WeaviateClient] = None,
            embeddings: Embeddings,
            default_top_k: int | None = None,
            default_mmq: int | None = None,
            max_context: int | None = None,
            search_type: WeaviateSearchType = WeaviateSearchType.HYBRID,
            reranker: Any | None = None,
    ):
        self.settings = settings or Settings().RAG
        # allow per-instance override via kwargs (take kwargs over settings)
        self.weaviate_url = self.settings.weaviate_url
        self.weaviate_api_key = self.settings.weaviate_api_key
        self.collection = collection or self.settings.collection
        self.text_key = text_key or self.settings.text_key
        self.default_top_k = int(default_top_k or self.settings.top_k)
        self.default_mmq = int(default_mmq or self.settings.mmq)
        self.max_context = int(max_context or self.settings.max_context)
        self.search_type = search_type or self.settings.search_type
        self.alpha = self.settings.alpha
        self.alpha_multi_strong_max = self.settings.alpha_multi_strong_max
        self.alpha_single_strong_min = self.settings.alpha_single_strong_min
        self.alpha_weak_hit_min = self.settings.alpha_weak_hit_min
        self.alpha_no_bm25_min = self.settings.alpha_no_bm25_min
        if isinstance(self.search_type, str):
            self.search_type = WeaviateSearchType(self.search_type.lower())
        self.client = client
        self.embeddings = embeddings
        self.reranker = reranker

        # Prompt
        self.prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.settings.rag_prompt),
                ("human", "질문: {question}\n\nContext:\n{context}\n\n답변:")
            ]
        )

    def compress_docs(self, docs: Sequence[Document], query: str):
        """Compress retrieved documents while preserving scores and ranks."""
        return compress_docs_postprocessor(
            docs,
            query,
            embeddings=self.embeddings,
            max_context=self.max_context,
        )

    async def rerank_docs(self, docs: Sequence[Document], query: str) -> list[Document]:
        if self.reranker is None:
            return list(docs)
        try:
            if hasattr(self.reranker, "arerank"):
                reranked = await self.reranker.arerank(query, docs)
            else:
                reranked = self.reranker.rerank(query, docs)
            return list(reranked)
        except Exception as e:
            logger.warning("[RAG] rerank failed: %s", e)
            return list(docs)

    def join_context(self, docs: List[Document]) -> str:
        """
        Pack documents into a single context string with file and section headers.
        Respects the context budget and logs skipped chunks if the budget is exceeded.
        """
        try:
            docs = [Document.from_any(d) for d in docs]
        except Exception:
            docs = [d if isinstance(d, Document) else Document.from_langchain(d) for d in docs]

        buf, total = [], 0
        budget = self.max_context
        for d in docs:
            txt = d.page_content or ""
            title = d.title or (d.metadata.get("filename") if isinstance(d.metadata, dict) else None) or "Untitled"
            section = ""
            md = getattr(d, "metadata", {}) or {}
            if isinstance(md, dict):
                section = md.get("section") or ""

            ln = len(txt)

            try:
                left = (budget - total) if budget is not None else float("inf")
                logger.debug("[RAG][ctx-pack] want=%s left=%s file=%s chunk=%s",
                            ln, left, title,
                            (getattr(d, "chunk_index", None) or (d.metadata.get("chunk_index") if isinstance(d.metadata, dict) else None)))
            except Exception:
                pass

            if budget is not None and total + ln > budget:
                try:
                    left = (budget - total) if budget is not None else float("inf")
                    logger.debug("[RAG][ctx-pack] SKIP due to budget: file=%s chunk=%s need=%s left=%s",
                                title,
                                (getattr(d, "chunk_index", None) or (d.metadata.get("chunk_index") if isinstance(d.metadata, dict) else None)),
                                ln, left)
                except Exception:
                    pass
                continue

            buf.append(f"[{title}]{' > ' + section if section else ''}\n{txt}\n")
            total += ln

        return "\n---\n".join(buf)

    # ---------------- Retriever/Chain Builder ----------------
    def build_retriever(self, *, top_k: int | None = None, mmq: int | None = None,
                        filters: Dict[str, Any] | None = None,
                        text_key: Optional[str] = None, search_type: Optional[str] = None,
                        alpha: Optional[float] = None):
        """
        Build a retriever based on settings and per-request overrides.
        Supports BM25, Hybrid, near_text, near_vector, similarity, and MMR.
        """
        if self.client is None:
            raise ValueError("Weaviate client must be injected: RagPipeline(client=...)")
        if self.embeddings is None:
            raise ValueError("Embeddings must be injected: RagPipeline(embeddings=...)")

        # Compute effective search type and search kwargs
        st = normalize_search_type(search_type, self.search_type)
        logger.debug(f"[RAG] search_type: {st.value}")
        # Supported modes:
        #   - "hybrid":     Collections API (vector + BM25)
        #   - "near_text":  Collections API (semantic vector search; server-side vectorizer module required, e.g., text2vec-openai; client sends raw text)
        # Notes:
        #   * score_threshold is only respected by "similarity_score_threshold"
        #     (switch search_type if you want a hard cutoff)
        ctx = RagContext(
            client=self.client,
            collection=self.collection,
            embeddings=self.embeddings,
            text_key=(text_key or self.text_key),
            alpha=float(alpha) if alpha is not None else float(self.alpha),
            default_top_k=int(top_k or self.default_top_k),
            filters=filters,
            settings=self.settings,
        )
        if st == WeaviateSearchType.NEAR_TEXT:
            return WeaviateNearTextRetriever(ctx)
        else:
            return WeaviateHybridRetriever(ctx)

    def build(self):
        """
        Create the final RAG chain (prompt).
        Injects context via a retriever step.
        """
        async def _with_context(inputs: Dict[str, Any]):
            """
            Retrieve and compress context for the input question.

            Returns a dict of prompt variables (`question`, `context`) for downstream
            LLM invocation performed outside this pipeline.
            """
            rag_cfg = inputs.get("rag", {}) or {}
            retriever = self.build_retriever(
                top_k=rag_cfg.get("topK"),
                mmq=rag_cfg.get("mmq"),
                filters=rag_cfg.get("filters"),
                search_type=rag_cfg.get("searchType"),
                alpha=rag_cfg.get("alpha"),
            )
            q = inputs["question"]
            # Build a fresh retriever for this request and run the initial search.
            docs_seq: Sequence[Document]
            try:
                try:
                    logger.debug(
                        f"[RAG] cfg topK={rag_cfg.get('topK')} mmq={rag_cfg.get('mmq')} filters={rag_cfg.get('filters')}")
                except Exception:
                    pass
                result = retriever.invoke(q)
                docs_seq = self._extract_docs(result)
            except KeyError as e:
                # Handle missing text_key in collection (e.g., 'content' vs 'text'/'page_content')
                candidates = [self.text_key, "text", "page_content", "body", "chunk"]
                last_err = e
                for tk in candidates:
                    if not tk or tk == self.text_key:
                        continue
                    try:
                        retriever2 = self.build_retriever(
                            top_k=rag_cfg.get("topK"),
                            mmq=rag_cfg.get("mmq"),
                            filters=rag_cfg.get("filters"),
                            text_key=tk,
                        )
                        fallback_result = retriever2.invoke(q)
                        docs_seq = self._extract_docs(fallback_result)
                        # Success: remember the working text_key for subsequent calls
                        self.text_key = tk
                        break
                    except KeyError as ee:
                        last_err = ee
                        continue
                else:
                    raise last_err
            docs = list(docs_seq)
            reranked_docs = await self.rerank_docs(docs, q)
            logger.debug("[RAG] reranked_docs: %s", len(reranked_docs))
            compressed_docs = self.compress_docs(reranked_docs, q)
            logger.debug("[RAG] compressed_docs: %s", len(compressed_docs))
            if not compressed_docs:
                logger.warning("[RAG] No relevant documents found for query.")
                return {
                    "question": q,
                    "context": "No relevant documents were found. Providing a general answer to the question.",
                }

            context = self.join_context(compressed_docs)
            return {"question": q, "context": context}

        def _log_prompt_value(pv):
            """
            Pretty-print the prompt value (messages and roles) for debugging.
            """
            try:
                msgs = pv.to_messages()
                logger.debug("[PROMPT] -----")
                for m in msgs:
                    role = getattr(m, "type", None) or getattr(m, "role", "")
                    content = getattr(m, "content", "")
                    logger.debug(f"[{role}] {content}")
                logger.debug("-----")
            except Exception:
                try:
                    logger.debug("[PROMPT_STR] %s", pv.to_string())
                except Exception:
                    logger.debug("[PROMPT_RAW] %s", pv)
            return pv

        return (
                RunnableLambda(_with_context)
                | self.prompt
        )

def make_rag_chain(
    settings: RagConfig | None = None,
    pipeline: RagPipeline | None = None,
    embeddings: Embeddings | None = None,
):
    """
    Create a RAG chain from a RagPipeline instance.

    If an existing pipeline is not provided, embeddings must be given so that
    RagPipeline can be constructed correctly.
    """
    if pipeline is None:
        if embeddings is None:
            raise ValueError(
                "Embeddings must be provided when constructing a new RagPipeline: "
                "make_rag_chain(embeddings=...)"
            )
        pipe = RagPipeline(settings=settings, embeddings=embeddings)
    else:
        pipe = pipeline
    return pipe.build()
