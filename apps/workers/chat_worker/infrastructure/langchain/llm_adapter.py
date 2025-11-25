from __future__ import annotations
import inspect
import asyncio

from typing import List, Any

from charset_normalizer.md import getLogger
from langchain_core.messages import BaseMessage
from langchain_core.runnables import RunnableConfig

logger = getLogger(str(__name__))


def _extract_configurable_kwargs(
        config: RunnableConfig | dict | None,
) -> tuple[dict, RunnableConfig | dict | None]:
    if config is None:
        return {}, None

    if isinstance(config, dict):
        cfg = config.get("configurable") or {}
    else:
        cfg = getattr(config, "configurable", {}) or {}

    kwargs: dict = {}
    # Map configurable keys to runtime kwargs understood by OpenAI-like clients
    for key in (
            "model",
            "temperature",
            "max_tokens",
            "top_p",
            "frequency_penalty",
            "presence_penalty",
    ):
        if key in cfg and cfg[key] is not None:
            kwargs[key] = cfg[key]

    return kwargs, config


class LangchainLlmAdapter:
    """LlmPort implementation wrapping a LangChain ChatModel.

    Currently uses OpenAI via openai_client.get_llm().
    Can be replaced with vLLM or fallback client without changing domain code.
    """

    def __init__(self, llm: Any) -> None:
        """Wrap a LangChain-compatible LLM client (e.g., ChatOpenAI, VllmGrpcClient, etc.)."""
        self._llm = llm

    async def ainvoke(
            self,
            messages: List[BaseMessage],
            config: RunnableConfig | None = None,
    ) -> BaseMessage:
        """Non-streaming ChatCompletion using LangChain ainvoke."""
        kwargs, cfg = _extract_configurable_kwargs(config)
        if cfg is None:
            # Default behavior when no config is provided
            return await self._llm.ainvoke(messages, **kwargs)
        else:
            # Explicit config passthrough + runtime overrides
            return await self._llm.ainvoke(messages, config=cfg, **kwargs)

    async def astream(
            self,
            messages: List[BaseMessage],
            config: RunnableConfig | None = None,
    ):
        """Streaming ChatCompletion wrapper that forwards chunks via LangChain callbacks."""
        logger.debug("Streaming ChatCompletion", extra={"messages": messages})
        kwargs, cfg = _extract_configurable_kwargs(config)

        # Call backend .astream and support both:
        # 1) async iterator directly
        # 2) coroutine that resolves to an async iterator
        if cfg is None:
            stream_or_coro = self._llm.astream(messages, **kwargs)
        else:
            stream_or_coro = self._llm.astream(messages, config=cfg, **kwargs)

        if inspect.iscoroutine(stream_or_coro):
            astream = await stream_or_coro
        else:
            astream = stream_or_coro

        async for _chunk in astream:
            # Token delivery is handled by TokenStreamCallback.on_llm_new_token
            continue

    def stream(
            self,
            messages: List[BaseMessage],
            config: RunnableConfig | None = None,
    ):
        """
        UI-facing streaming interface.

        Returns a stream/generator that, when iterated:
          - Calls the underlying LLM `.stream`,
          - Triggers LangChain token callbacks,
          - Produces chunks for the UI.

        Designed to be called synchronously (e.g., Streamlit `write_stream`).
        """
        logger.debug("UI Streaming ChatCompletion", extra={"messages": messages})
        kwargs, cfg = _extract_configurable_kwargs(config)

        if cfg is None:
            stream = self._llm.stream(messages, **kwargs)
        else:
            stream = self._llm.stream(messages, config=cfg, **kwargs)

        return stream
