from pydantic import BaseModel, ConfigDict, Field


class LlmConfig(BaseModel):
    """LLM/generation defaults and provider-specific knobs."""

    model_config = ConfigDict(extra="ignore")

    openai_api_key: str | None = Field(default=None)

    default_provider: str = Field(default="vllm")
    fallback_providers: str = Field(default="openai")
    response_provider: str | None = Field(default=None)
    response_model: str | None = Field(default=None)
    title_provider: str | None = Field(default=None)
    title_model: str | None = Field(default=None)
    rerank_provider: str | None = Field(default=None)
    rerank_model: str | None = Field(default=None)

    timeout_ms: int = Field(default=10_000)
    gateway_addr: str = Field(default="localhost:50052")
    default_model: str = Field(default="Qwen2.5-1.5B-Instruct")
    max_tokens: int = Field(default=4096)
    model: str = Field(default="gpt-4o-mini")
    temperature: float = Field(default=0.7)
    timeout_s: int | None = Field(default=90)
    top_p: float = Field(default=0.95)
    reasoning_effort_default: str = Field(default="medium")  # for reasoning-capable models (o3/o1)

    max_ctx_tokens: int | None = Field(default=None)
    max_history_turns: int | None = Field(default=None)
    summarize_threshold: int | None = Field(default=None)

    embedding_model: str = Field(default="text-embedding-3-large")
