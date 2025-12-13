from __future__ import annotations
import asyncio
import logging
from typing import Dict, Tuple, Optional, Iterable, Any

from langchain_openai import ChatOpenAI  # LangChain 0.2+ 권장
from apps.workers.chat_worker.settings import Settings

_settings = Settings()
_lock = asyncio.Lock()
_registry: Dict[Tuple[str, float, Optional[int], Optional[str]], ChatOpenAI] = {}
_log = logging.getLogger(__name__)


def _make_key(model: str, temperature: float, timeout_s: Optional[int], reasoning_effort: Optional[str]) -> Tuple[str, float, Optional[int], Optional[str]]:
    return model, temperature, timeout_s, reasoning_effort


def _detect_reasoning_effort(model: str) -> Optional[str]:
    """Return a default reasoning_effort for reasoning-capable models."""
    normalized = model.lower()
    # Heuristics: reasoning-capable models (OpenAI naming) include:
    # - o3-*, o1-* (OpenAI reasoning series)
    # - gpt-4.1*, gpt-5* (next-gen with optional reasoning params)
    # - any model explicitly containing "-reasoning"
    if normalized.startswith(("o3-", "o1-", "gpt-5")) or "-reasoning" in normalized:
        return _settings.LLM_REASONING_EFFORT_DEFAULT
    return None


def _create_llm(model: str, temperature: float, timeout_s: Optional[int], reasoning_effort: Optional[str]) -> ChatOpenAI:
    # OpenAI reasoning models disallow temperature with reasoning_effort; pass explicitly when set.
    init_kwargs: dict[str, Any] = {
        "model": model,
        "streaming": True,
        "timeout": timeout_s,
    }
    if reasoning_effort:
        init_kwargs["reasoning_effort"] = reasoning_effort
    else:
        init_kwargs["temperature"] = temperature

    return ChatOpenAI(**init_kwargs)


async def get_llm(
        model: Optional[str] = None,
        *,
        temperature: Optional[float] = None,
        timeout_s: Optional[int] = None,
        reasoning_effort: Optional[str] = None,
) -> ChatOpenAI:
    m = model or _settings.LLM_MODEL
    t = temperature if temperature is not None else _settings.LLM_TEMPERATURE
    to = timeout_s if timeout_s is not None else _settings.LLM_TIMEOUT_S
    effort = reasoning_effort or _detect_reasoning_effort(m)

    key = _make_key(m, t, to, effort)
    if key in _registry:
        return _registry[key]

    _log.info(f"Creating new OpenAI client for model={m}, temperature={t}, timeout_s={to} effective_effort={effort}")

    async with _lock:
        if key in _registry:
            return _registry[key]
        llm = _create_llm(m, t, to, effort)
        # Attach metadata for observability/metrics (used by LangchainLlmAdapter)
        # Note: Some LangChain model classes (pydantic-based) may disallow dynamic attributes.
        try:
            setattr(llm, "provider", "openai")
            # Keep the requested model string as the source of truth
            setattr(llm, "model", m)
        except Exception as e:
            # Fallback: bypass pydantic __setattr__ where possible
            try:
                object.__setattr__(llm, "provider", "openai")
                object.__setattr__(llm, "model", m)
            except Exception:
                # Best-effort only; do not break LLM creation if the object is strict
                _log.debug("Failed to attach metadata to OpenAI client: %r", e)
        _registry[key] = llm
        return llm


async def warmup(messages: Optional[Iterable[Any]] = None) -> None:
    llm = await get_llm()
    _ = llm  # no-op
