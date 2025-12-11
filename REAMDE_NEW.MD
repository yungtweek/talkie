# Talkie — Portfolio Snapshot

Talkie is an end-to-end RAG/AI-agent starter kit that splits Gateway, Workers, and Infra into independent services so each piece can scale and evolve on its own. It is intentionally production-lean: streaming-first I/O, event-driven pipelines, and clear boundaries between orchestration, inference, and data.

## What It Solves
- Real-time chat with history-aware and RAG modes, streamed over SSE to the web app.
- Reliable ingest-to-index pipeline that turns uploaded files into searchable vectors with deterministic chunk IDs.
- Decoupled LLM access via a Go gRPC gateway in front of vLLM (with OpenAI fallback), keeping workers free from model/vendor lock-in.
- Operational guardrails: Kafka outbox style flows, ownership enforcement, soft deletion, and structured metrics for LLM runs.

## System at a Glance
- apps/web (Next.js): UI for chat, sessions, ingest, and live token streaming.
- apps/gateway (NestJS): GraphQL/REST APIs, SSE bridge, auth, session and file lifecycles.
- apps/workers/index_worker (Python): Extract → clean → chunk → embed → upsert into vector store; idempotent and backpressure-aware.
- apps/workers/chat_worker (Python): Consumes `chat.request`, runs GEN/RAG, streams tokens to Redis Streams, persists history and metrics.
- apps/llm-gateway (Go): gRPC front to vLLM/OpenAI; normalizes models, timeouts, and streaming semantics.
- infra/docker: Compose stack for Kafka, Redis, Postgres, Weaviate, and observability basics.
- docs/features/*: Feature-level design notes (gateway chat/ingest/auth, workers, llm-gateway).

## Highlights and Decisions
- Event-driven backbone: Kafka for job dispatch; Redis Streams for low-latency fan-out to Gateway/Web (SSE-friendly).
- Streaming-first UX: tokens travel vLLM → gRPC → worker → Redis → Gateway SSE, keeping latency low and clients simple.
- RAG quality: Weaviate v4 with hybrid BM25+vector search, language-friendly query normalization, deterministic chunk IDs for safe retries.
- Boundary contracts: Zod/Pydantic validation at API and repo layers; cursor/keyset pagination for scalable lists.
- Observability: Metrics tables (`llm_jobs`, `llm_messages`) capture latency and token usage; structured logging across services.
- Safety: JWT guards, ownership enforcement for sessions/files, soft delete flows aligned across Gateway and Workers.

## Key Flows
- Chat: Gateway enqueues `chat.request` → Chat Worker builds context and (optional) RAG → streams tokens to Redis → Gateway exposes SSE → Web renders live output; metrics and history land in Postgres.
- Ingest: Web requests presigned PUT → Gateway marks file PENDING/READY → publishes `ingest.request` → Index Worker extracts/chunks/embeds → vectors upserted; statuses persisted and streamable.
- Model access: Workers call LLM Gateway gRPC, which fronts vLLM HTTP; errors/timeouts normalized so worker code stays deterministic.

## Tech Stack
- Frontend: Next.js (App Router, SSR), React 19.
- Gateway: NestJS, GraphQL + REST, SSE, Redis Streams bridge, Kafka producers/consumers.
- Workers: Python 3.12, LangChain, aiokafka, Weaviate client, Redis Streams, async I/O.
- LLM: vLLM behind Go gRPC gateway; OpenAI GPT-4o for embeddings/fallback.
- Data: Postgres, Weaviate v4; Redis for streaming; Kafka for jobs.
- Infra: Docker Compose, Make targets, Prometheus/Grafana scaffolding, MinIO-compatible storage.

## Local Dev (short)
1) Install deps: `pnpm install` (root), `python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`.
2) Bring up infra: `make docker-up`.
3) Run apps: `make web` (Next.js), `make gateway` (NestJS), `make llm-gateway` (Go), `make worker-chat` and `make worker-index` after setting the relevant `.env.local` files.
4) Tear down: `make docker-down`.

## What to Read Next
- docs/features/gateway/chat.md — chat streaming and SSE bridge.
- docs/features/gateway/ingest.md — presign and file lifecycle.
- docs/features/workers/chat.md — worker-side streaming, metrics, and RAG.
- docs/features/workers/index.md — ingest-to-index pipeline.
- docs/features/llm-gateway/llm-gateway.md — gRPC facade for vLLM/OpenAI.
