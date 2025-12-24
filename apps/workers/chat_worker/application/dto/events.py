from __future__ import annotations

from typing import Literal, Optional

from chat_worker.application.dto.common import MyBaseModel


class RagSearchCallEvent(MyBaseModel):
    """
    Stream event payload for RAG search lifecycle.
    """
    event: Literal["rag_search_call.in_progress", "rag_search_call.completed"]
    job_id: str
    user_id: str
    session_id: Optional[str] = None
    query: Optional[str] = None
    hits: Optional[int] = None
    took_ms: Optional[int] = None
