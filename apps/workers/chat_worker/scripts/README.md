# Scripts

## verify_weaviate_vectors.py

Verifies that Weaviate results include vectors and that the RAG postprocessors can consume them.

### Usage

Run from `apps/workers/chat_worker`:

```bash
python scripts/verify_weaviate_vectors.py --log-level DEBUG
```

From repo root:

```bash
make verify-weaviate-vectors LOG_LEVEL=DEBUG
```

### Options

- `--query`: Override the query text.
- `--top-k`: Number of results to fetch (default: 2).
- `--grpc-port`: Weaviate gRPC port (default: 50051).
- `--show-items`: Show raw `[items]` logs.
- `--log-level`: Logging level (default: INFO).
