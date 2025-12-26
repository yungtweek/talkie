// infra/kafka/outbox.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Kysely, Selectable, sql } from 'kysely';
import { DB, KYSELY } from '@/modules/infra/database/kysely/kysely.module';

type OutboxRow = Selectable<DB['outbox']>;
type OutboxId = OutboxRow['id'];

@Injectable()
export class OutboxRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Insert an event into the outbox table (for async dispatch).
   * @returns numeric outbox id for traceability
   */
  async insertOutbox(params: {
    jobId: string;
    topic: string;
    payload: unknown;
  }): Promise<OutboxId | null> {
    const { jobId, topic, payload } = params;

    const idempotencyKey = jobId;

    const result = await sql<{ id: OutboxId }>`
      INSERT INTO outbox (job_id, topic, key, payload_json, idempotency_key)
      VALUES (
        ${jobId},
        ${topic},
        ${jobId},
        jsonb_set(${JSON.stringify(payload ?? {})}::jsonb, '{outboxCreatedAt}', to_jsonb(now()), true),
        ${idempotencyKey}
      )
      ON CONFLICT (topic, idempotency_key)
      DO NOTHING
      RETURNING id
    `.execute(this.db);

    return result.rows[0]?.id ?? null;
  }
  async lockPendingBatch(limit: number): Promise<OutboxRow[]> {
    const result = await sql<OutboxRow>`
      UPDATE outbox
      SET status = 'publishing',
          last_attempt_at = now()
      WHERE id IN (
        SELECT id
        FROM outbox
        WHERE status IN ('pending', 'failed')
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `.execute(this.db);

    return result.rows;
  }

  async markPublished(id: OutboxId): Promise<OutboxRow | null> {
    const result = await sql<OutboxRow>`
      UPDATE outbox
      SET status = 'published',
          published_at = now()
      WHERE id = ${id}
      RETURNING *
    `.execute(this.db);

    return result.rows[0] ?? null;
  }

  async markFailed(id: OutboxId, err: unknown): Promise<OutboxRow | null> {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);

    const result = await sql<OutboxRow>`
      UPDATE outbox
      SET
        retry_count     = retry_count + 1,
        status          = CASE
                            WHEN retry_count + 1 >= 5 THEN 'dead_lettered'
                            ELSE 'failed'
          END,
        last_error      = ${message},
        last_attempt_at = now(),
        next_attempt_at = CASE
                            WHEN retry_count + 1 >= 5
                              THEN next_attempt_at      -- dead_lettered면 더 이상 안 씀
                            ELSE now() + (interval '30 seconds' * (retry_count + 1))
          END
      WHERE id = ${id}
      RETURNING *
    `.execute(this.db);

    return result.rows[0] ?? null;
  }
}
