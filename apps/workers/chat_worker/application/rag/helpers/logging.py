def log_items(items, logger, label: str = "[RAG]", limit: int = 10) -> None:
    """
    Log retrieval diagnostics for a short list of items.

    Args:
        items: Iterable of retrieval results (Weaviate objects or similar) that may have
               `metadata.score`, `metadata.distance`, and `properties.filename`.
        logger: Logger instance to use (e.g., logging.getLogger(...)).
        label: Text prefix prepended to each line (e.g., "[RAG][hybrid]").
        limit: Maximum number of items to log.
    """
    for i, o in enumerate(items[:limit]):
        md = getattr(o, "metadata", None)
        s = getattr(md, "score", None)
        d = getattr(md, "distance", None)
        props = getattr(o, "properties", {}) or {}
        fn = props.get("filename")
        logger.info(f"{label} #{i} score={s} dist={d} file={fn}")
