from __future__ import annotations

import asyncio
import uuid
from typing import Dict, Tuple, Optional, Iterable, Any, List

import grpc
from langchain_core.messages import BaseMessage, AIMessage
from langchain_core.outputs import LLMResult, ChatGeneration
from langchain_core.runnables import RunnableConfig

from chat_worker.infrastructure.grpc_stubs.llm import llm_pb2_grpc, llm_pb2
from chat_worker.logging_setup import get_logger
from chat_worker.settings import Settings

logger = get_logger(str(__name__))

_settings = Settings()
_lock = asyncio.Lock()
_registry: Dict[Tuple[str, str, Optional[int]], VllmGrpcClient] = {}


def _make_key(addr: str, model: str, timeout_ms: Optional[int]) -> Tuple[str, str, Optional[int]]:
    return addr, model, timeout_ms


def _messages_to_prompts(messages: List[BaseMessage]) -> tuple[str, str]:
    """Convert LangChain messages into (system_prompt, user_prompt)."""
    system_parts: list[str] = []
    user_parts: list[str] = []

    for m in messages:
        role = getattr(m, "type", None) or getattr(m, "role", None)
        content = m.content if isinstance(m.content, str) else str(m.content)

        if role in ("system", "system_message"):
            system_parts.append(content)
        elif role in ("human", "user", "human_message"):
            user_parts.append(content)
        else:
            # For AI/other roles, append as metadata after user prompt
            user_parts.append(f"\n\n[prev {role}]: {content}")

    system_prompt = "\n\n".join(system_parts) if system_parts else ""
    user_prompt = "\n\n".join(user_parts) if user_parts else ""
    return system_prompt, user_prompt


class VllmGrpcClient:
    """gRPC client for the Go llm-gateway wrapper around vLLM."""

    def __init__(
            self,
            addr: str,
            model: str,
            timeout_ms: Optional[int],
    ) -> None:
        self.addr = addr
        self.provider = "vllm"
        self.model = model
        self.timeout_ms = timeout_ms

        self._channel: Optional[grpc.aio.Channel] = None
        self._stub: Optional[llm_pb2_grpc.LlmServiceStub] = None

    async def _get_stub(self) -> llm_pb2_grpc.LlmServiceStub:
        if self._stub is None:
            # TODO: migrate to secure_channel when TLS is enabled
            self._channel = grpc.aio.insecure_channel(self.addr)
            self._stub = llm_pb2_grpc.LlmServiceStub(self._channel)
        return self._stub

    def _build_request(
            self,
            system_prompt: str,
            user_prompt: str,
            config: RunnableConfig | None,
            **kwargs: Any,
    ) -> llm_pb2.ChatCompletionRequest:
        if config is None:
            cfg: dict[str, Any] = {}
        else:
            if isinstance(config, dict):
                cfg = config.get("configurable", {}) or {}
            else:
                cfg = getattr(config, "configurable", {}) or {}

        # Merge runtime kwargs on top of configurable; kwargs take precedence.
        params: dict[str, Any] = dict(cfg)
        params.update(kwargs)

        model = params.get("model", self.model)
        temperature = params.get("temperature", _settings.LLM_TEMPERATURE)
        max_tokens = params.get("max_tokens", _settings.LLM_MAX_TOKENS)
        top_p = params.get("top_p", _settings.LLM_TOP_P)

        return llm_pb2.ChatCompletionRequest(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            context="",
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
        )

    async def ainvoke(
            self,
            messages: List[BaseMessage],
            config: RunnableConfig | None = None,
            **kwargs: Any,
    ) -> AIMessage:
        """Unary ChatCompletion request."""
        stub = await self._get_stub()
        system_prompt, user_prompt = _messages_to_prompts(messages)
        req = self._build_request(system_prompt, user_prompt, config, **kwargs)

        timeout_s = (self.timeout_ms or _settings.LLM_TIMEOUT_MS) / 1000.0

        # Unary RPC call
        resp = await stub.ChatCompletion(req, timeout=timeout_s)

        output_text = resp.output_text
        return AIMessage(content=output_text)

    async def astream(
            self,
            messages: List[BaseMessage],
            config: RunnableConfig | None = None,
            **kwargs: Any,
    ) -> None:
        """Server‑streaming ChatCompletion that forwards chunks into LangChain callbacks."""
        stub = await self._get_stub()
        system_prompt, user_prompt = _messages_to_prompts(messages)
        req = self._build_request(system_prompt, user_prompt, config, **kwargs)
        timeout_s = (self.timeout_ms or _settings.LLM_TIMEOUT_MS) / 1000.0
        callbacks = []
        tags: list[str] = []
        run_id: str = ""
        if config:
            # Extract callbacks, tags, and run_id from RunnableConfig
            if isinstance(config, dict):
                callbacks = list(config.get("callbacks") or [])
                tags = list(config.get("tags") or [])
                run_id = str(config.get("run_id") or config.get("metadata", {}).get("run_id") or "")
            else:
                callbacks = list(getattr(config, "callbacks", []) or [])
                tags = list(getattr(config, "tags", []) or [])
                run_id = str(getattr(config, "run_id", "") or getattr(getattr(config, "metadata", None) or {}, "get", lambda _k, _d=None: _d)("run_id"))

        if not run_id:
            run_id = uuid.uuid4().hex

        # Fire start callbacks once (needed for TTFT/metrics correlation).
        serialized = {"provider": "vllm", "model": req.model, "transport": "grpc"}
        # Prompts for LLM-style callbacks (best-effort)
        prompts = [system_prompt + "\n\n" + user_prompt if system_prompt else user_prompt]

        for cb in callbacks:
            on_chat_start = getattr(cb, "on_chat_model_start", None)
            on_llm_start = getattr(cb, "on_llm_start", None)

            if on_chat_start is not None:
                # Some handlers expect messages rather than prompts; we pass best-effort.
                result = on_chat_start(serialized, messages, run_id=run_id, tags=tags)
                if asyncio.iscoroutine(result):
                    await result
            elif on_llm_start is not None:
                result = on_llm_start(serialized, prompts, run_id=run_id, tags=tags)
                if asyncio.iscoroutine(result):
                    await result

        output_parts: list[str] = []
        end_called = False

        async for chunk in stub.ChatCompletionStream(req, timeout=timeout_s):
            # Handle Responses-style stream events
            if chunk.type == "output_text.delta":
                delta = chunk.text
                if not delta:
                    continue

                output_parts.append(delta)

                # Forward decoded delta text into TokenStreamCallback
                for cb in callbacks:
                    on_token = getattr(cb, "on_llm_new_token", None)
                    if on_token is None:
                        continue

                    # TokenStreamCallback is used inside run_coroutine_threadsafe,
                    # so here just await on_token(...) (already async)
                    await on_token(delta, run_id=run_id, tags=tags)

            elif chunk.type == "output_text.done":
                # Build a proper LLMResult for LangChain callbacks
                output_text = "".join(output_parts)
                token_usage = {
                    "prompt_tokens": int(chunk.prompt_tokens or 0),
                    "completion_tokens": int(chunk.completion_tokens or 0),
                    "total_tokens": int(chunk.total_tokens or 0),
                }

                logger.info(
                    "LLM output_text.done",
                    extra={
                        "type": chunk.type,
                        "prompt_tokens": token_usage["prompt_tokens"],
                        "completion_tokens": token_usage["completion_tokens"],
                        "total_tokens": token_usage["total_tokens"],
                    },
                )

                gen_list = [ChatGeneration(message=AIMessage(content=output_text))]
                llm_result = LLMResult(
                    generations=[gen_list],
                    llm_output={"token_usage": token_usage},
                )

                # Trigger end-of-stream callbacks once
                if not end_called:
                    end_called = True
                    for cb in callbacks:
                        on_end = getattr(cb, "on_llm_end", None)
                        if on_end is None:
                            continue
                        result = on_end(llm_result, run_id=run_id, tags=tags)
                        if asyncio.iscoroutine(result):
                            await result

                break

        # If the stream ended without an explicit done event, still fire on_llm_end once.
        if not end_called:
            output_text = "".join(output_parts)
            gen_list = [ChatGeneration(message=AIMessage(content=output_text))]
            llm_result = LLMResult(
                generations=[gen_list],
                llm_output={"token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}},
            )
            for cb in callbacks:
                on_end = getattr(cb, "on_llm_end", None)
                if on_end is None:
                    continue
                result = on_end(llm_result, run_id=run_id, tags=tags)
                if asyncio.iscoroutine(result):
                    await result


def _create_client(
        addr: str,
        model: str,
        timeout_ms: Optional[int],
) -> VllmGrpcClient:
    return VllmGrpcClient(addr=addr, model=model, timeout_ms=timeout_ms)


async def get_llm(
        model: Optional[str] = None,
        *,
        temperature: Optional[float] = None,  # NOTE: temperature is ignored for now, kept for API compatibility
        timeout_s: Optional[int] = None,
) -> VllmGrpcClient:
    """Factory for reusing vLLM gRPC clients (keyed by addr/model/timeout)."""
    addr = _settings.LLM_GATEWAY_ADDR
    m = model or _settings.LLM_DEFAULT_MODEL
    # Temperature is ignored for now, kept for API compatibility
    _ = temperature
    if timeout_s is not None:
        # Convert seconds to milliseconds for the internal timeout value
        to_ms = int(timeout_s * 1000)
    else:
        to_ms = _settings.LLM_TIMEOUT_MS

    logger.info("vLLM gRPC client config", extra={"timeout_s": timeout_s, "to_ms": to_ms})

    logger.info("vLLM gRPC client config", extra={
        "addr": addr,
        "model": m,
        "timeout_ms": to_ms,
    })

    key = _make_key(addr, m, to_ms)
    if key in _registry:
        return _registry[key]

    async with _lock:
        if key in _registry:
            return _registry[key]
        client = _create_client(addr, m, to_ms)
        _registry[key] = client
        return client


async def warmup(messages: Optional[Iterable[Any]] = None) -> None:
    """Pre-initialize the gRPC channel."""
    _ = messages
    client = await get_llm()
    _ = client  # no-op
