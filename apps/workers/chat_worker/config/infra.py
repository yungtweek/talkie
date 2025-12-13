from pydantic import BaseModel, ConfigDict, Field


class InfraConfig(BaseModel):
    """Infrastructure endpoints and batch sizing."""

    model_config = ConfigDict(extra="ignore")

    db_url: str | None = Field(default=None, description="Postgres DSN; required in most environments")
    redis_url: str = Field(default="redis://localhost:6379")
    kafka_bootstrap: str = Field(default="localhost:29092")
    batch_size: int = Field(default=64)
