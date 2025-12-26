from __future__ import annotations

from logging import getLogger
from typing import Any, Dict, Optional, Sequence

from chat_worker.application.dto.events import (
    RagSearchCallEvent,
    RagSearchEventType,
    RagStageCallEvent,
    RagStageEventType,
)
from chat_worker.application.rag.document import Document
from chat_worker.infrastructure.stream.stream_service import safe_publish

from .query import kw_tokens_split, normalize_query


UNSET = object()
logger = getLogger("RagPipeline")


def total_chars(items: Sequence[Document]) -> int:
    total = 0
    for d in items:
        total += len(getattr(d, "page_content", "") or "")
    return total


def get_override(cfg: Dict[str, Any], *keys: str, default: Any = UNSET) -> Any:
    for key in keys:
        if key in cfg:
            return cfg[key]
    return default


def rerank_cfg_value(reranker: Any, name: str) -> Optional[int]:
    if reranker is None:
        return None
    cfg = getattr(reranker, "_cfg", None) or getattr(reranker, "cfg", None)
    return getattr(cfg, name, None) if cfg is not None else None


def doc_key(doc: Document) -> str:
    md = doc.metadata if isinstance(doc.metadata, dict) else {}
    key = (
        doc.chunk_id
        or md.get("chunk_id")
        or md.get("id")
        or doc.doc_id
        or md.get("doc_id")
    )
    if key:
        return str(key)
    if doc.uri:
        return f"uri:{doc.uri}"
    title = doc.title or md.get("filename") or ""
    page = doc.page if doc.page is not None else md.get("page")
    chunk_index = doc.chunk_index if doc.chunk_index is not None else md.get("chunk_index")
    if title or page is not None or chunk_index is not None:
        return f"{title}|{page}|{chunk_index}"
    return f"content:{hash(doc.page_content or '')}"


def merge_docs(
    docs_by_query: Sequence[Sequence[Document]],
    *,
    limit: Optional[int] = None,
) -> list[Document]:
    merged: list[Document] = []
    seen: set[str] = set()
    for docs in docs_by_query:
        for d in docs:
            doc = Document.from_any(d)
            key = doc_key(doc)
            if key in seen:
                continue
            seen.add(key)
            merged.append(doc)
            if limit is not None and len(merged) >= limit:
                return merged
    return merged


def expand_queries(query: str, mmq: int) -> list[str]:
    if mmq <= 1:
        return [query]
    variants: list[str] = []

    def _add(q: str) -> None:
        text = (q or "").strip()
        if not text:
            return
        if text not in variants:
            variants.append(text)

    _add(query)
    try:
        _add(normalize_query(query, mode="light"))
        _add(normalize_query(query, mode="full"))
        toks, rare = kw_tokens_split(query)
        if rare:
            _add(" ".join(rare))
        if toks:
            _add(" ".join(toks))
    except Exception:
        pass

    return variants[:max(1, mmq)]


def stream_context(inputs: Dict[str, Any]) -> Dict[str, Any]:
    stream = inputs.get("stream") or {}
    publish = stream.get("publish")
    record_event = stream.get("record_event")
    job_id = stream.get("job_id")
    user_id = stream.get("user_id")
    session_id = stream.get("session_id")
    has_stream = bool(publish and job_id and user_id)
    return {
        "publish": publish,
        "record_event": record_event,
        "job_id": job_id,
        "user_id": user_id,
        "session_id": session_id,
        "has_stream": has_stream,
    }


async def emit_search_event(
    stream_ctx: Dict[str, Any],
    event: RagSearchEventType,
    *,
    query: Optional[str] = None,
    hits: Optional[int] = None,
    took_ms: Optional[int] = None,
) -> None:
    if not stream_ctx.get("has_stream"):
        return
    search_event = RagSearchCallEvent(
        event=event,
        job_id=stream_ctx.get("job_id"),
        user_id=stream_ctx.get("user_id"),
        session_id=stream_ctx.get("session_id"),
        query=query,
        hits=hits,
        took_ms=took_ms,
    )
    await safe_publish(
        stream_ctx.get("publish"),
        search_event.model_dump(by_alias=True, exclude_none=True),
    )
    record_event = stream_ctx.get("record_event")
    if record_event:
        try:
            payload = search_event.model_dump(by_alias=True, exclude_none=True)
            payload = {
                k: v
                for k, v in payload.items()
                if k not in ("event", "jobId", "userId", "sessionId")
            }
            await record_event(search_event.event, payload)
        except Exception as exc:
            logger.warning("[RAG] job event persist failed: %s", exc)


async def emit_stage_event(
    stream_ctx: Dict[str, Any],
    event: RagStageEventType,
    *,
    query: Optional[str] = None,
    hits: Optional[int] = None,
    took_ms: Optional[int] = None,
    input_hits: Optional[int] = None,
    output_hits: Optional[int] = None,
    input_chars: Optional[int] = None,
    output_chars: Optional[int] = None,
    reranker: Optional[str] = None,
    rerank_top_n: Optional[int] = None,
    rerank_max_candidates: Optional[int] = None,
    rerank_batch_size: Optional[int] = None,
    rerank_max_doc_chars: Optional[int] = None,
    mmr_k: Optional[int] = None,
    mmr_fetch_k: Optional[int] = None,
    mmr_lambda: Optional[float] = None,
    mmr_similarity_threshold: Optional[float] = None,
    max_context: Optional[int] = None,
    use_llm: Optional[bool] = None,
    heuristic_hits: Optional[int] = None,
    llm_applied: Optional[bool] = None,
) -> None:
    if not stream_ctx.get("has_stream"):
        return
    stage_event = RagStageCallEvent(
        event=event,
        job_id=stream_ctx.get("job_id"),
        user_id=stream_ctx.get("user_id"),
        session_id=stream_ctx.get("session_id"),
        query=query,
        hits=hits,
        took_ms=took_ms,
        input_hits=input_hits,
        output_hits=output_hits,
        input_chars=input_chars,
        output_chars=output_chars,
        reranker=reranker,
        rerank_top_n=rerank_top_n,
        rerank_max_candidates=rerank_max_candidates,
        rerank_batch_size=rerank_batch_size,
        rerank_max_doc_chars=rerank_max_doc_chars,
        mmr_k=mmr_k,
        mmr_fetch_k=mmr_fetch_k,
        mmr_lambda=mmr_lambda,
        mmr_similarity_threshold=mmr_similarity_threshold,
        max_context=max_context,
        use_llm=use_llm,
        heuristic_hits=heuristic_hits,
        llm_applied=llm_applied,
    )
    await safe_publish(
        stream_ctx.get("publish"),
        stage_event.model_dump(by_alias=True, exclude_none=True),
    )
    record_event = stream_ctx.get("record_event")
    if record_event:
        try:
            payload = stage_event.model_dump(by_alias=True, exclude_none=True)
            payload = {
                k: v
                for k, v in payload.items()
                if k not in ("event", "jobId", "userId", "sessionId")
            }
            await record_event(stage_event.event, payload)
        except Exception as exc:
            logger.warning("[RAG] job event persist failed: %s", exc)


def log_prompt_value(pv, logger):
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
