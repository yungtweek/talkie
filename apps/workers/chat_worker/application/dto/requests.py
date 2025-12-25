from __future__ import annotations
from datetime import datetime
from typing import Literal

from chat_worker.application.dto.common import MyBaseModel


class ChatRequest(MyBaseModel):
    """
    Kafka payload shape for `chat.request`.
    """
    job_id: str
    user_id: str
    session_id: str
    message: str
    mode: Literal["gen", "rag"] = "gen"
    outbox_created_at: datetime | None = None
    outbox_published_at: datetime | None = None


class TitleRequest(MyBaseModel):
    """
       Kafka payload shape for `chat.title.generate`.
     """
    trace_id: str
    job_id: str
    user_id: str
    session_id: str
    message: str
