"""Logging configuration utilities for the chat worker."""
import json
import logging
import sys

import click

from uvicorn.logging import DefaultFormatter

NOISY_LOGGERS = (
    "aiokafka",
    "urllib3",
    "asyncio",
    "botocore",
    "httpcore",
    "httpx",
    "s3transfer",
    "boto3",
    "openai._base_client",
)

_configured = False
_configured_levels: tuple[str, str] | None = None

_STANDARD_KEYS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "message",
    "asctime",
    "levelprefix",
    "extra",
}


class ExtraFormatter(DefaultFormatter):
    """Uvicorn formatter that appends JSON-encoded extras if present."""

    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        record.extra = ""
        extras = {k: v for k, v in record.__dict__.items() if k not in _STANDARD_KEYS}
        if extras:
            try:
                extra_json = json.dumps(extras, ensure_ascii=False, default=str)
                record.extra = " " + click.style(extra_json, fg="bright_black")
            except Exception:
                record.extra = " " + click.style(str(extras), fg="bright_black")

        # Colorize level prefix manually (uvicorn colors disabled by default)
        level = record.levelname
        if level == "DEBUG":
            record.levelprefix = click.style("DEBUG", fg="cyan")
        elif level == "INFO":
            record.levelprefix = click.style("INFO", fg="green")
        elif level == "WARNING":
            record.levelprefix = click.style("WARNING", fg="yellow")
        elif level == "ERROR":
            record.levelprefix = click.style("ERROR", fg="red")
        elif level == "CRITICAL":
            record.levelprefix = click.style("CRITICAL", fg="bright_red", bold=True)

        return super().format(record)


def configure_logging(log_level: str, noisy_level: str) -> logging.Logger:
    """Configure root logger with uvicorn DefaultFormatter + JSON extras.

    Idempotent: subsequent calls keep existing configuration.
    """
    global _configured, _configured_levels
    if _configured and _configured_levels == (log_level, noisy_level):
        return logging.getLogger("ChatWorker")

    fmt = "%(levelprefix)s %(asctime)s %(name)s: %(message)s%(extra)s"
    formatter_kwargs = {"use_colors": True, "datefmt": "%H:%M:%S"}

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ExtraFormatter(fmt, **formatter_kwargs))
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        handlers=[handler],
        force=True,
    )
    for noisy in NOISY_LOGGERS:
        logging.getLogger(noisy).setLevel(noisy_level)
    _configured = True
    _configured_levels = (log_level, noisy_level)
    return logging.getLogger("ChatWorker")


def get_logger(name: str = "ChatWorker", log_level: str | None = None, noisy_level: str | None = None) -> logging.Logger:
    """Drop-in helper similar to logging.getLogger that ensures one-time config."""
    configure_logging(log_level=log_level or "INFO", noisy_level=noisy_level or "WARNING")
    return logging.getLogger(name)
