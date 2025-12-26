from __future__ import annotations

from typing import Literal, Optional

from chat_worker.application.dto.common import MyBaseModel


RagSearchEventType = Literal["rag_retrieve.in_progress", "rag_retrieve.completed"]
RagStageEventType = Literal[
    "rag_rerank.in_progress",
    "rag_rerank.completed",
    "rag_mmr.in_progress",
    "rag_mmr.completed",
    "rag_compress.in_progress",
    "rag_compress.completed",
]


class RagSearchCallEvent(MyBaseModel):
    """
    Stream event payload for RAG search lifecycle.
    """
    event: RagSearchEventType
    job_id: str
    user_id: str
    session_id: Optional[str] = None
    query: Optional[str] = None
    hits: Optional[int] = None
    took_ms: Optional[int] = None


class RagStageCallEvent(MyBaseModel):
    """
    Stream event payload for RAG stage lifecycle (rerank/mmr/compress).
    """
    event: RagStageEventType
    job_id: str
    user_id: str
    session_id: Optional[str] = None
    query: Optional[str] = None
    hits: Optional[int] = None
    took_ms: Optional[int] = None
    input_hits: Optional[int] = None
    output_hits: Optional[int] = None
    input_chars: Optional[int] = None
    output_chars: Optional[int] = None
    reranker: Optional[str] = None
    rerank_top_n: Optional[int] = None
    rerank_max_candidates: Optional[int] = None
    rerank_batch_size: Optional[int] = None
    rerank_max_doc_chars: Optional[int] = None
    mmr_k: Optional[int] = None
    mmr_fetch_k: Optional[int] = None
    mmr_lambda: Optional[float] = None
    mmr_similarity_threshold: Optional[float] = None
    max_context: Optional[int] = None
    use_llm: Optional[bool] = None
    heuristic_hits: Optional[int] = None
    llm_applied: Optional[bool] = None
