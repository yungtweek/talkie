from __future__ import annotations

from typing import Protocol, List, AsyncIterator
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatResult
from langchain_core.runnables import RunnableConfig


class LlmPort(Protocol):
    """
    LLM port used in the domain layer.

    Supports both single response (`chat`) and streaming (`chat_stream`).
    RAG logic should call the LLM only through this port.
    """

    async def ainvoke(self, messages: List[BaseMessage], config: RunnableConfig | None = None, ) -> BaseMessage:
        """Standard ChatCompletion request (single response)."""
        ...

    async def astream(self, messages: List[BaseMessage], config: RunnableConfig | None = None, ) -> None:
        """Streaming ChatCompletion (yields deltaText chunks)."""
        ...
