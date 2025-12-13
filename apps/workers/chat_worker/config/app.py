from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class AppConfig(BaseModel):
    """Application/logging level configuration."""

    model_config = ConfigDict(extra="ignore")

    log_level: str = Field(default=LogLevel.DEBUG.value)
    noisy_level: str = Field(default=LogLevel.WARNING.value)
    app_name: str | None = Field(default="chat_worker")
