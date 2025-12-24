from __future__ import annotations

import json
import math
from typing import Any, Mapping, Optional, Sequence, Tuple

import asyncpg

from chat_worker.domain.ports.chat_repo import ChatRepositoryPort


def _sanitize_json(value: Any) -> Any:
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, Mapping):
        return {k: _sanitize_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_json(v) for v in value]
    return value


class PostgresChatRepo(ChatRepositoryPort):
    """Postgres implementation of the worker-side chat repository.

    Notes
    -----
    - DB-first design: events are append-only; a final assistant message is upserted by job_id.
    - Concurrency: lock the parent session row to serialize message_index allocation.
    - Idempotency: (job_id) unique for assistant messages, (job_id, seq) unique for events.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    # -------------------------
    # Event logging (append-only)
    # -------------------------
    async def append_event(
            self,
            *,
            job_id: str,
            session_id: str,
            event_type: str,
            seq: int,
            payload: Mapping[str, Any],
    ) -> None:
        payload_json = json.dumps(_sanitize_json(payload or {}), ensure_ascii=False, allow_nan=False)
        sql = (
            """
            INSERT INTO chat_events (job_id, session_id, event_type, seq, payload_json)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            ON CONFLICT (job_id, seq) DO NOTHING;
            """
        )
        async with self.pool.acquire() as conn:
            await conn.execute(sql, job_id, session_id, event_type, seq, payload_json)

    async def append_job_event(
            self,
            *,
            job_id: str,
            user_id: str,
            session_id: Optional[str],
            event_type: str,
            payload: Mapping[str, Any],
    ) -> None:
        payload_json = json.dumps(_sanitize_json(payload or {}), ensure_ascii=False, allow_nan=False)
        sql = (
            """
            INSERT INTO job_events (job_id, user_id, session_id, event, payload)
            VALUES ($1, $2, $3, $4, $5::jsonb);
            """
        )
        async with self.pool.acquire() as conn:
            await conn.execute(sql, job_id, user_id, session_id, event_type, payload_json)

    # -------------------------
    # Finalize assistant message (idempotent upsert)
    # -------------------------
    async def finalize_assistant_message(
            self,
            *,
            session_id: str,
            mode: str = "gen",
            job_id: str,
            content: str,
            sources: Optional[Mapping[str, Any]] = None,
            usage_prompt: Optional[int] = None,
            usage_completion: Optional[int] = None,
            trace_id: Optional[str] = None,
    ) -> Tuple[str, int, int]:
        """Persist the final assistant message (with mode) for a job and return (id, message_index, turn).

        Algorithm (within a single transaction):
          1) Lock session row: SELECT id FROM chat_sessions WHERE id=$1 FOR UPDATE
          2) next_index = COALESCE(MAX(message_index),0)+1 for the session
          3) current_turn = COALESCE(MAX(turn),0) for the session (assistant shares latest user turn)
          4) INSERT ... ON CONFLICT (job_id) DO UPDATE ... RETURNING id, message_index, turn
        """
        insert_sql = (
            """
            INSERT INTO chat_messages (id, session_id, role, mode, content, message_index, turn, job_id,
                                       sources_json, usage_prompt, usage_completion, status, trace_id)
            VALUES (gen_random_uuid(), $1, 'assistant', $2, $3, $4, $5, $6,
                    $7::jsonb, $8, $9, 'done', $10)
            ON CONFLICT (job_id) DO UPDATE SET content          = EXCLUDED.content,
                                               mode             = EXCLUDED.mode,
                                               sources_json     = EXCLUDED.sources_json,
                                               usage_prompt     = EXCLUDED.usage_prompt,
                                               usage_completion = EXCLUDED.usage_completion,
                                               status           = 'done',
                                               trace_id         = COALESCE(EXCLUDED.trace_id, chat_messages.trace_id)
            RETURNING id, message_index, turn;
            """
        )

        sources_json = json.dumps(_sanitize_json(sources or {}), ensure_ascii=False, allow_nan=False)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1) Lock the parent session to serialize index allocation
                await conn.execute(
                    "SELECT id FROM chat_sessions WHERE id=$1 FOR UPDATE;",
                    session_id,
                )

                # 2) Compute next message_index
                row = await conn.fetchrow(
                    """
                    SELECT COALESCE(MAX(message_index), 0) + 1 AS next_index
                    FROM chat_messages
                    WHERE session_id = $1;
                    """,
                    session_id,
                )
                next_index: int = int(row["next_index"]) if row else 1

                # 3) Compute current turn (assistant shares latest user turn)
                row2 = await conn.fetchrow(
                    """
                    SELECT COALESCE(MAX(turn), 0) AS current_turn
                    FROM chat_messages
                    WHERE session_id = $1;
                    """,
                    session_id,
                )
                current_turn: int = int(row2["current_turn"]) if row2 else 0

                # 4) Upsert assistant message and return identifiers
                rec = await conn.fetchrow(
                    insert_sql,
                    session_id,     # $1
                    mode,           # $2
                    content,        # $3
                    next_index,     # $4
                    current_turn,   # $5
                    job_id,         # $6
                    sources_json,   # $7
                    usage_prompt,   # $8
                    usage_completion, # $9
                    trace_id,       # $10
                )

        # asyncpg.Record -> tuple
        return str(rec["id"]), int(rec["message_index"]), int(rec["turn"])

    # -------------------------
    # Message citations (RAG)
    # -------------------------
    async def save_message_citations(
            self,
            *,
            message_id: str,
            session_id: str,
            citations: Sequence[Mapping[str, Any]],
    ) -> None:
        if not citations:
            return

        rows: list[Tuple[str, str, str, str, Optional[str], str, Optional[int], Optional[str], Optional[float]]] = []
        seen_chunk: set[Tuple[str, int]] = set()
        seen_source: set[str] = set()

        def _pick(item: Mapping[str, Any], *keys: str) -> Any:
            meta = item.get("metadata")
            meta = meta if isinstance(meta, Mapping) else {}
            for key in keys:
                if key in item and item.get(key) is not None:
                    return item.get(key)
                if key in meta and meta.get(key) is not None:
                    return meta.get(key)
            return None

        for item in citations:
            if not isinstance(item, Mapping):
                continue
            source_id = _pick(item, "source_id", "sourceId", "id")
            file_name = _pick(item, "file_name", "fileName", "filename", "title", "source")
            file_uri = _pick(item, "file_uri", "fileUri", "uri", "url")
            chunk_id = _pick(item, "chunk_id", "chunkId", "chunk")
            page = _pick(item, "page", "page_number", "pageNumber")
            snippet = _pick(item, "snippet", "text", "excerpt")
            rerank_score = _pick(item, "rerank_score", "rerankScore", "score")

            if source_id is None or file_name is None or chunk_id is None:
                continue

            try:
                page_val = int(page) if page is not None else None
            except Exception:
                page_val = None

            try:
                score_val = float(rerank_score) if rerank_score is not None else None
            except Exception:
                score_val = None

            chunk_key = (str(chunk_id), page_val if page_val is not None else -1)
            if chunk_key in seen_chunk:
                continue
            if str(source_id) in seen_source:
                continue
            seen_chunk.add(chunk_key)
            seen_source.add(str(source_id))

            rows.append(
                (
                    message_id,
                    session_id,
                    str(source_id),
                    str(file_name),
                    str(file_uri) if file_uri is not None else None,
                    str(chunk_id),
                    page_val,
                    str(snippet) if snippet is not None else None,
                    score_val,
                )
            )

        if not rows:
            return

        insert_sql = (
            """
            INSERT INTO message_citations (
                message_id,
                session_id,
                source_id,
                file_name,
                file_uri,
                chunk_id,
                page,
                snippet,
                rerank_score
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
            """
        )

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "DELETE FROM message_citations WHERE message_id = $1;",
                    message_id,
                )
                await conn.executemany(insert_sql, rows)

    # -------------------------
    # Job status updates (optional)
    # -------------------------
    async def update_job_status(
            self,
            *,
            job_id: str,
            status: str,
            error: Optional[str] = None,
    ) -> None:
        sql = (
            """
            UPDATE jobs
            SET status     = $2,
                error      = $3,
                updated_at = now()
            WHERE id = $1;
            """
        )
        async with self.pool.acquire() as conn:
            await conn.execute(sql, job_id, status, error)
