from typing import Any, Mapping, Union

from chat_worker.application.rag.retrievers.base import RagContext
from chat_worker.settings import WeaviateSearchType

from .filters import normalize_filters


def resolve_context(ctx: RagContext, top_k: int | None, filters: Mapping[str, Any] | None):
    """
    Unpack commonly used context parts and normalize inputs.

    Returns:
        (client, collection_name, text_key, k, mmq, normalized_filters)
    """
    client = ctx.client
    collection_name = ctx.collection
    text_key = getattr(ctx, "text_key", "text")
    k = int(top_k or getattr(ctx, "default_top_k", 6) or 6)
    mmq = getattr(ctx, "mmq", None)
    nf = normalize_filters(dict(filters) if filters else None)
    return client, collection_name, text_key, k, mmq, nf


def normalize_search_type(
    x: Union[WeaviateSearchType, str, None],
    fb: WeaviateSearchType,
) -> WeaviateSearchType:
    """
    Normalize a user-provided search type to a WeaviateSearchType enum.
    """
    if x is None:
        return fb
    return x if isinstance(x, WeaviateSearchType) else WeaviateSearchType(str(x).lower())
