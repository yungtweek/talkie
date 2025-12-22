#!/usr/bin/env python
import argparse
import logging
import sys
from pathlib import Path
from urllib.parse import urlparse

import weaviate
from weaviate.auth import AuthApiKey

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chat_worker.settings import Settings
from chat_worker.application.rag.retrievers.base import RagContext
from chat_worker.application.rag.retrievers.weaviate_near_text import WeaviateNearTextRetriever
from chat_worker.application.rag.retrievers.weaviate_hybrid import WeaviateHybridRetriever


class _DropItemsFilter(logging.Filter):
    def filter(self, record):
        return "[items]" not in record.getMessage()


def _select_vector(vec):
    if isinstance(vec, dict):
        if "default" in vec:
            vec = vec.get("default")
        elif vec:
            vec = next(iter(vec.values()))
        else:
            return None
    if isinstance(vec, list) and vec and isinstance(vec[0], list):
        vec = vec[0]
    return vec if isinstance(vec, list) else None


def _infer_dim(obj) -> int | None:
    vec = getattr(obj, "vector", None)
    vec = _select_vector(vec)
    return len(vec) if vec else None


def _default_query(obj, text_key: str) -> str:
    props = getattr(obj, "properties", {}) or {}
    raw_text = props.get(text_key) or ""
    words = raw_text.strip().split()
    if words:
        return " ".join(words[:12])
    return "test"


def _connect_weaviate(url: str, api_key: str | None, grpc_port: int) -> weaviate.WeaviateClient:
    parsed = urlparse(url)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    secure = parsed.scheme == "https"
    auth = AuthApiKey(api_key) if api_key else None

    if secure:
        return weaviate.connect_to_custom(
            http_host=host,
            http_port=port,
            http_secure=True,
            grpc_host=host,
            grpc_port=grpc_port,
            grpc_secure=True,
            auth_credentials=auth,
        )
    return weaviate.connect_to_local(
        host=host,
        port=port,
        grpc_port=grpc_port,
        auth_credentials=auth,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Weaviate vectors are attached to RAG docs.")
    parser.add_argument("--query", default=None, help="Query text to use (default: derived from one stored doc)")
    parser.add_argument("--top-k", type=int, default=2, help="Number of results to fetch")
    parser.add_argument("--grpc-port", type=int, default=50051, help="Weaviate gRPC port")
    parser.add_argument("--show-items", action="store_true", help="Show raw [items] logs")
    parser.add_argument("--log-level", default="INFO", help="Logging level (e.g., DEBUG, INFO)")
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not args.show_items:
        logging.getLogger("WeaviateNearTextRetriever").addFilter(_DropItemsFilter())

    settings = Settings().rag
    url = settings.weaviate_url or "http://localhost:8080"

    try:
        client = _connect_weaviate(url, settings.weaviate_api_key, args.grpc_port)
    except Exception as exc:
        logging.error("Weaviate connect failed: %s", exc)
        return 1

    try:
        coll = client.collections.use(settings.collection)
        obj = None
        try:
            res = coll.query.fetch_objects(
                limit=1,
                include_vector=True,
                return_properties=[settings.text_key],
            )
            objs = list(res.objects or [])
            obj = objs[0] if objs else None
        except Exception as exc:
            logging.warning("fetch_objects failed: %s", exc)

        query_text = args.query or (_default_query(obj, settings.text_key) if obj else "test")
        dim = _infer_dim(obj) if obj else None
        logging.info("Using query: %s", query_text)

        ctx = RagContext(
            client=client,
            collection=settings.collection,
            embeddings=None,
            text_key=settings.text_key,
            alpha=settings.alpha,
            default_top_k=args.top_k,
        )

        logging.info("Running near_text query (top_k=%s)", args.top_k)
        WeaviateNearTextRetriever(ctx).invoke(query_text, top_k=args.top_k)

        if dim:
            class DummyEmbeddings:
                def __init__(self, n):
                    self.n = n

                def embed_query(self, _query):
                    return [0.0] * self.n

            ctx_hybrid = RagContext(
                client=client,
                collection=settings.collection,
                embeddings=DummyEmbeddings(dim),
                text_key=settings.text_key,
                alpha=settings.alpha,
                default_top_k=args.top_k,
            )
            logging.info("Running hybrid query (top_k=%s, dim=%s)", args.top_k, dim)
            WeaviateHybridRetriever(ctx_hybrid).invoke(query_text, top_k=args.top_k)
        else:
            logging.warning("Skip hybrid query: could not infer vector dimension")
    finally:
        try:
            client.close()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
