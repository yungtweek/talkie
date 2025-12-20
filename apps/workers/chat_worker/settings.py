"""Typed configuration for the chat worker."""
from pathlib import Path
import os

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

from .config import AppConfig, InfraConfig, LlmConfig, RagConfig, WeaviateSearchType

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """Entry point for application settings.

    Configuration is grouped into smaller sub-configs (app, infra, llm, rag)
    to keep this file readable. Backwards-compatible properties expose the
    previous upper-case names so existing imports continue to work.
    """

    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", BASE_DIR / ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        env_nested_delimiter="__",
    )

    app: AppConfig = Field(default_factory=AppConfig)
    infra: InfraConfig = Field(default_factory=InfraConfig)
    llm: LlmConfig = Field(default_factory=LlmConfig)
    rag: RagConfig = Field(default_factory=RagConfig)

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Use env-first loading; skip dotenv in production."""
        if os.getenv("APP_ENV") == "production":
            return env_settings, init_settings, file_secret_settings
        return env_settings, init_settings, file_secret_settings, dotenv_settings

    @model_validator(mode="after")
    def _propagate_embedding_model(self):
        # If rag.embedding_model not explicitly set, inherit llm.embedding_model
        if self.rag.embedding_model is None and self.llm.embedding_model:
            self.rag.embedding_model = self.llm.embedding_model
        return self

    # --- Backwards-compatible property accessors ---
    @property
    def OPENAI_API_KEY(self) -> str | None: # noqa: N802
        return self.llm.openai_api_key

    @property
    def DB_URL(self) -> str | None: # noqa: N802
        return self.infra.db_url

    @property
    def LOG_LEVEL(self) -> str: # noqa: N802
        return self.app.log_level

    @property
    def NOISY_LEVEL(self) -> str: # noqa: N802
        return self.app.noisy_level

    @property
    def APP_NAME(self) -> str | None: # noqa: N802
        return self.app.app_name

    @property
    def WEAVIATE_URL(self) -> str | None: # noqa: N802
        return self.rag.weaviate_url

    @property
    def WEAVIATE_API_KEY(self) -> str | None: # noqa: N802
        return self.rag.weaviate_api_key

    @property
    def WEAVIATE_COLLECTION(self) -> str: # noqa: N802
        return self.rag.collection

    @property
    def BATCH_SIZE(self) -> int: # noqa: N802
        return self.infra.batch_size

    @property
    def EMBEDDING_MODEL(self) -> str: # noqa: N802
        # Prefer rag override if set, otherwise llm default
        return self.rag.embedding_model or self.llm.embedding_model

    @property
    def RAG_TOP_K(self) -> int: # noqa: N802
        return self.rag.top_k

    @property
    def RAG_MMQ(self) -> int: # noqa: N802
        return self.rag.mmq

    @property
    def RAG_MAX_CONTEXT(self) -> int: # noqa: N802
        return self.rag.max_context

    @property
    def RAG(self) -> RagConfig: # noqa: N802
        return self.rag

    @property
    def LLM_PRIMARY_PROVIDER(self) -> str: # noqa: N802
        provider, _ = self.resolve_response_provider_model()
        return provider

    @property
    def LLM_DEFAULT_PROVIDER(self) -> str: # noqa: N802
        # Alias for clarity: default provider aligns with default model
        return self.LLM_PRIMARY_PROVIDER

    @property
    def LLM_FALLBACK_PROVIDERS(self) -> str: # noqa: N802
        return self.llm.fallback_providers

    @property
    def LLM_TIMEOUT_MS(self) -> int: # noqa: N802
        return self.llm.timeout_ms

    @property
    def LLM_GATEWAY_ADDR(self) -> str: # noqa: N802
        return self.llm.gateway_addr

    @property
    def LLM_DEFAULT_MODEL(self) -> str: # noqa: N802
        _, model = self.resolve_response_provider_model()
        return model

    @property
    def LLM_MAX_TOKENS(self) -> int: # noqa: N802
        return self.llm.max_tokens

    @property
    def LLM_MODEL(self) -> str: # noqa: N802
        return self.llm.model

    @property
    def LLM_RESPONSE_PROVIDER(self) -> str | None: # noqa: N802
        return self.llm.response_provider

    @property
    def LLM_RESPONSE_MODEL(self) -> str | None: # noqa: N802
        return self.llm.response_model

    @property
    def LLM_TITLE_PROVIDER(self) -> str | None: # noqa: N802
        return self.llm.title_provider

    @property
    def LLM_TITLE_MODEL(self) -> str | None: # noqa: N802
        return self.llm.title_model

    @property
    def LLM_RERANK_PROVIDER(self) -> str | None: # noqa: N802
        return self.llm.rerank_provider

    @property
    def LLM_RERANK_MODEL(self) -> str | None: # noqa: N802
        return self.llm.rerank_model

    # Canonical resolvers (providers/models)
    def resolve_response_provider_model(self) -> tuple[str, str]:
        provider = (self.llm.response_provider or self.llm.default_provider).lower()
        if provider == "openai":
            model = self.llm.response_model or self.llm.model
        else:
            model = self.llm.response_model or self.llm.default_model
        return provider, model

    def resolve_title_provider_model(self) -> tuple[str, str]:
        resp_provider, resp_model = self.resolve_response_provider_model()
        provider = (self.llm.title_provider or resp_provider).lower()
        if provider == "openai":
            model = self.llm.title_model or (resp_model if provider == resp_provider else self.llm.model)
        else:
            model = self.llm.title_model or (resp_model if provider == resp_provider else self.llm.default_model)
        return provider, model

    def resolve_rerank_provider_model(self) -> tuple[str, str]:
        resp_provider, resp_model = self.resolve_response_provider_model()
        provider = (self.llm.rerank_provider or resp_provider).lower()
        if provider == "openai":
            model = self.llm.rerank_model or (resp_model if provider == resp_provider else self.llm.model)
        else:
            model = self.llm.rerank_model or (resp_model if provider == resp_provider else self.llm.default_model)
        return provider, model

    @property
    def LLM_TEMPERATURE(self) -> float: # noqa: N802
        return self.llm.temperature

    @property
    def LLM_TIMEOUT_S(self) -> int | None: # noqa: N802
        return self.llm.timeout_s

    @property
    def LLM_TOP_P(self) -> float: # noqa: N802
        return self.llm.top_p

    @property
    def LLM_REASONING_EFFORT_DEFAULT(self) -> str: # noqa: N802
        return self.llm.reasoning_effort_default

    @property
    def MAX_CTX_TOKENS(self) -> int | None: # noqa: N802
        return self.llm.max_ctx_tokens

    @property
    def MAX_HISTORY_TURNS(self) -> int | None: # noqa: N802
        return self.llm.max_history_turns

    @property
    def SUMMARIZE_THRESHOLD(self) -> int | None: # noqa: N802
        return self.llm.summarize_threshold

    @property
    def REDIS_URL(self) -> str: # noqa: N802
        return self.infra.redis_url

    @property
    def KAFKA_BOOTSTRAP(self) -> str: # noqa: N802
        return self.infra.kafka_bootstrap


def load_settings() -> Settings:
    """Helper for dependency injection in tests or entrypoints."""
    return Settings()


__all__ = [
    "Settings",
    "load_settings",
    "WeaviateSearchType",
    "AppConfig",
    "InfraConfig",
    "LlmConfig",
    "RagConfig",
]
