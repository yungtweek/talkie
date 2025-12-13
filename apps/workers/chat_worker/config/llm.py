from pydantic import BaseModel, ConfigDict, Field


class LlmConfig(BaseModel):
    """LLM/generation defaults and provider-specific knobs."""

    model_config = ConfigDict(extra="ignore")

    openai_api_key: str | None = Field(default=None)

    primary_provider: str = Field(default="vllm")
    fallback_providers: str = Field(default="openai")

    timeout_ms: int = Field(default=10_000)
    gateway_addr: str = Field(default="localhost:50052")
    default_model: str = Field(default="Qwen2.5-1.5B-Instruct")
    max_tokens: int = Field(default=1024)
    model: str = Field(default="gpt-4o-mini")
    temperature: float = Field(default=0.7)
    timeout_s: int | None = Field(default=90)
    top_p: float = Field(default=0.95)

    max_ctx_tokens: int | None = Field(default=None)
    max_history_turns: int | None = Field(default=None)
    summarize_threshold: int | None = Field(default=None)

    embedding_model: str = Field(default="text-embedding-3-large")
