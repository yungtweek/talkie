"""
RAG helper utilities.

Re-exported helpers split by domain for backward compatibility.
"""

from .chain import (
    UNSET,
    doc_key,
    emit_search_event,
    emit_stage_event,
    expand_queries,
    get_override,
    merge_docs,
    rerank_cfg_value,
    stream_context,
    total_chars,
)
from .context import normalize_search_type, resolve_context
from .filters import normalize_filters
from .logging import log_items
from .matching import count_hits, kw_hit
from .query import ko_tech_aliases, kw_tokens, kw_tokens_split, normalize_query
from .snippets import extract_snippets

__all__ = [
    "UNSET",
    "log_items",
    "resolve_context",
    "normalize_filters",
    "normalize_search_type",
    "normalize_query",
    "ko_tech_aliases",
    "kw_tokens",
    "kw_tokens_split",
    "count_hits",
    "kw_hit",
    "extract_snippets",
    "doc_key",
    "merge_docs",
    "expand_queries",
    "stream_context",
    "emit_search_event",
    "emit_stage_event",
    "rerank_cfg_value",
    "get_override",
    "total_chars",
]
